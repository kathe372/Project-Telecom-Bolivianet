#!/usr/bin/env bash
# Siembra los dos usuarios que necesitan las pruebas E2E.
#
# Requiere: el stack levantado (docker compose up -d) y `python -m pip install bcrypt`.
# Es idempotente: se puede ejecutar tantas veces como haga falta.
#
# Por qué no se usa la cuenta de administrador real: tres intentos fallidos la
# bloquean, y un administrador bloqueado hace fallar el arranque del backend si
# no esta ADMIN_RESET_PASSWORD en el entorno. Una suite de pruebas no debe poder
# tumbar un despliegue.
#
# Por que se insertan por SQL y no por POST /api/users: ese endpoint envia un
# correo de activacion, lo que ataria la siembra a que el SMTP responda.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLAVE='E2ePrueba2026!'

DBP=$(grep -E '^DB_PASSWORD=' "$RAIZ/.env" | cut -d= -f2-)
if [ -z "$DBP" ]; then echo "DB_PASSWORD no esta en .env" >&2; exit 1; fi

# BCrypt con el mismo factor de trabajo que BcryptPasswordHasher (12).
HASH=$(python -c "import bcrypt;print(bcrypt.hashpw(b'$CLAVE', bcrypt.gensalt(12)).decode())")

docker exec -e PGPASSWORD="$DBP" bolivianet-postgres \
  psql -U telecom_user -d telecombolivianet -v ON_ERROR_STOP=1 -c "
INSERT INTO \"UserSystems\"
  (\"Id\",\"FullName\",\"Email\",\"PasswordHash\",\"Role\",\"Status\",
   \"RequiresPasswordChange\",\"FailedLoginAttempts\",\"CreatedAt\")
VALUES
  ('e2e00000-0000-0000-0000-000000000001','ZZ-E2E Admin',
   'zz-e2e-admin@test.bo','$HASH','Admin','Activo',false,0,NOW()),
  ('e2e00000-0000-0000-0000-000000000002','ZZ-E2E Tecnico',
   'zz-e2e-tecnico@test.bo','$HASH','Tecnico','Activo',false,0,NOW())
ON CONFLICT (\"Id\") DO UPDATE SET
  \"PasswordHash\"           = EXCLUDED.\"PasswordHash\",
  \"Status\"                 = 'Activo',
  \"FailedLoginAttempts\"    = 0,
  \"RequiresPasswordChange\" = false;
"

echo "Usuarios E2E listos. Ejecutar con: npx playwright test"
echo "Para borrarlos:  scripts/e2e-limpiar-usuarios.sh"
