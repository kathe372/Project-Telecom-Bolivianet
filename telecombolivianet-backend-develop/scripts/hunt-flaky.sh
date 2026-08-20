#!/usr/bin/env bash
#
# Caza de tests intermitentes en la suite de integración.
#
# Ejecuta la suite N veces guardando un .trx por corrida y, al final, lista los
# tests que fallaron CON SU NOMBRE. Sin el nombre, diagnosticar un flaky es
# especular: así se encontró D-03 (ver BUGS_DESCUBIERTOS.md), cuyas dos hipótesis
# iniciales resultaron falsas.
#
#   Uso:  ./scripts/hunt-flaky.sh [corridas]     (por defecto 10)
#
# Requiere Docker (Testcontainers) y un build previo en Release:
#   dotnet build Project-Telecom-Bolivianet.sln -c Release
#
set -u
RUNS="${1:-10}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="$ROOT/telecombolivianet-backend-develop/TestResults/flaky-hunt"

cd "$ROOT" || exit 1
mkdir -p "$OUT"
rm -f "$OUT"/*.trx "$OUT"/resumen.txt

for i in $(seq 1 "$RUNS"); do
  echo "===== corrida $i de $RUNS =====" | tee -a "$OUT/resumen.txt"
  dotnet test telecombolivianet-backend-develop/tests/TelecomBoliviaNet.IntegrationTests \
    --no-build -c Release --nologo \
    --results-directory "$OUT" \
    --logger "trx;LogFileName=run-$i.trx" 2>&1 \
    | grep -E "Passed!|Failed!" | tee -a "$OUT/resumen.txt"
done

{
  echo ""
  echo "===== TESTS QUE FALLARON (por nombre) ====="
  grep -ho 'testName="[^"]*"[^>]*outcome="Failed"' "$OUT"/*.trx 2>/dev/null \
    | sed 's/testName="//; s/".*//' | sort | uniq -c | sort -rn
  echo ""
  echo "Detalle del error: abrir el .trx de la corrida que falló y buscar <Message>."
} | tee -a "$OUT/resumen.txt"
