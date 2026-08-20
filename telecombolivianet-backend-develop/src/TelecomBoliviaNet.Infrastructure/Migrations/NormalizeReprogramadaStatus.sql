-- Fase 2 (nivel comercial): normaliza Reprogramada → Pendiente (BUG B3).
-- Respaldo manual para Railway si la migración EF 20260715000002 no se aplica.

UPDATE "Installations"
SET "Status" = 'Pendiente', "ReminderSentAt" = NULL
WHERE "Status" = 'Reprogramada';

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
SELECT '20260715000002_NormalizeReprogramadaStatus', '8.0.0'
WHERE NOT EXISTS (
    SELECT 1 FROM "__EFMigrationsHistory"
    WHERE "MigrationId" = '20260715000002_NormalizeReprogramadaStatus'
);
