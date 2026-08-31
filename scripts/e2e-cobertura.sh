#!/usr/bin/env bash
# ⚠️  NO FUNCIONA TODAVIA — el andamiaje esta, la medicion no sale.
#
# Estado: el ciclo completo se ejecuta (imagen instrumentada, backend arrancado
# bajo coverlet, suite E2E, apagado ordenado) y el informe SE ESCRIBE, pero sale
# vacio: coverlet no instrumenta ningun modulo y su tabla de modulos aparece en
# blanco, sin ningun aviso que lo explique.
#
# ESTABLECIDO con certeza:
#   - Los .pdb estan en /app junto a los .dll (comprobado en el contenedor).
#   - coverlet SI escribe el informe al cerrar: la señal llega y el fichero
#     aparece. Lo que sale vacio es el contenido, no el mecanismo.
#   - coverlet corre como PID 1 y NO reenvia SIGTERM a su hijo. Un `docker stop`
#     normal lo mata con SIGKILL y no se escribe NADA, sin error visible: solo
#     un fichero que no aparece. Por eso este script señala al proceso hijo.
#
# NO establecido (lo intente y la prueba no valia): descartar el filtro
# --include. Ese diagnostico se hizo lanzando un SEGUNDO coverlet dentro del
# contenedor mientras el primero ya tenia /app instrumentado, asi que el
# resultado no dice nada. Queda por comprobar de verdad.
#
# Hipotesis a probar, por orden:
#   1. El filtro --include: repetirlo sobre un contenedor limpio.
#   2. Que la reescritura de los .dll falle en silencio; probar copiando /app a
#      un directorio escribible y apuntando coverlet ahi.
#
# Mide QUE cubren las pruebas E2E dentro del backend.
#
# Las E2E entran por HTTP a un contenedor, asi que `dotnet test --collect` no ve
# nada de lo que ejercitan: la capa Application aparece al 30,9 % cuando sus
# archivos con "cobertura cero" —CreateTicketCommand, RegisterClientCommand,
# CreateInstallationCommand— son justamente los que la suite recorre en cada
# ejecucion. Sin esto, esa cifra es un suelo y no una medida.
#
# Lo que hace: levanta el backend bajo coverlet, corre la suite, cierra la
# aplicacion para que el informe se escriba, y resume el resultado por capa.
#
# Uso:  scripts/e2e-cobertura.sh
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

SALIDA="$RAIZ/cobertura-e2e"
mkdir -p "$SALIDA"
rm -f "$SALIDA"/*.xml

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.coverage.yml"

echo "==> Construyendo el backend instrumentado (lleva SDK: tarda mas que el normal)"
$COMPOSE build backend

echo "==> Levantandolo"
$COMPOSE up -d backend

echo -n "==> Esperando a que responda"
for _ in $(seq 1 60); do
  codigo=$(curl -s -o /dev/null -w '%{http_code}' http://localhost/api/plans || echo 000)
  if [ "$codigo" != "000" ] && [ "$codigo" != "502" ]; then echo " listo ($codigo)"; break; fi
  echo -n "."; sleep 2
done

echo "==> Ejecutando la suite E2E"
# Si alguna prueba falla, la medicion sigue siendo valida: interesa que se haya
# EJERCITADO el codigo, no que todo pasara.
npx playwright test --project=api || echo "   (hubo fallos; la medicion sigue valiendo)"

# ── El detalle que hace que esto funcione ───────────────────────────────────
# coverlet corre como PID 1 y NO reenvia SIGTERM a su hijo. Un `docker stop`
# normal acaba matando el proceso con SIGKILL y no se escribe ningun informe,
# sin error visible: solo un fichero que no aparece. Hay que señalar al proceso
# hijo —la aplicacion— y dejar que coverlet termine por su cuenta.
echo "==> Cerrando la aplicacion para que coverlet escriba el informe"
docker exec bolivianet-backend sh -c 'kill -TERM $(cat /proc/1/task/1/children)'

echo -n "==> Esperando al informe"
for _ in $(seq 1 60); do
  if [ -s "$SALIDA/e2e.cobertura.xml" ]; then echo " listo"; break; fi
  echo -n "."; sleep 2
done

$COMPOSE stop -t 30 backend > /dev/null 2>&1 || true

echo ""
echo "==> Lo que cubren las E2E"
python "$RAIZ/scripts/resumir-cobertura.py" "$SALIDA"

echo ""
echo "Para volver al backend normal:  docker compose up -d --build backend"
