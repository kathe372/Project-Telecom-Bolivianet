-- Fase 5 (nivel comercial): evidencia de cierre de instalación.
-- Respaldo manual para Railway si la migración EF 20260716000001 no se aplica.

ALTER TABLE "Installations"
    ADD COLUMN IF NOT EXISTS "EquipoOnuSerial" character varying(100) NULL,
    ADD COLUMN IF NOT EXISTS "MetrosDrop"      integer NULL,
    ADD COLUMN IF NOT EXISTS "ChecklistJson"   text NULL,
    ADD COLUMN IF NOT EXISTS "FotosUrlsJson"   text NULL;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
SELECT '20260716000001_AddInstallationEvidence', '8.0.0'
WHERE NOT EXISTS (
    SELECT 1 FROM "__EFMigrationsHistory"
    WHERE "MigrationId" = '20260716000001_AddInstallationEvidence'
);
