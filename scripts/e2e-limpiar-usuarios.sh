#!/usr/bin/env bash
# Borra los usuarios sembrados para E2E y las marcas que dejan las pruebas
# del webhook en Redis.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DBP=$(grep -E '^DB_PASSWORD=' "$RAIZ/.env" | cut -d= -f2-)
RP=$(grep -E '^REDIS_PASSWORD=' "$RAIZ/.env" | cut -d= -f2-)

# UserSystems tiene 18 claves foraneas apuntandole, la mayoria con RESTRICT
# (SupportTickets.CreatedByUserId, Payments.RegisteredByUserId, Installations
# .TecnicoId...). Las pruebas actuales solo inician sesion, asi que no dejan
# filas en ninguna de ellas y el borrado sale limpio.
#
# Si en el futuro alguna prueba crea datos de negocio, este DELETE fallara con
# un error de FK. Eso es lo correcto: significa que quedan datos de prueba en
# tablas reales y hay que borrarlos primero, no forzar el borrado del usuario.
#
# Las sesiones van antes que el usuario.
docker exec -e PGPASSWORD="$DBP" bolivianet-postgres \
  psql -U telecom_user -d telecombolivianet -v ON_ERROR_STOP=1 -c "
DELETE FROM \"RefreshTokens\"
 WHERE \"UserId\" IN (SELECT \"Id\" FROM \"UserSystems\" WHERE \"Email\" LIKE 'zz-e2e-%');
DELETE FROM \"UserSystems\" WHERE \"Email\" LIKE 'zz-e2e-%';
"

# Los telefonos que usan las pruebas del webhook (inexistentes, 5910000000x).
docker exec bolivianet-redis redis-cli -a "$RP" --no-auth-warning \
  DEL rl:59100000000 rl:notified:59100000000 \
      rl:59100000001 rl:notified:59100000001 > /dev/null

rm -f "$RAIZ"/e2e/.estado-*.json

echo "Datos de E2E limpiados."
