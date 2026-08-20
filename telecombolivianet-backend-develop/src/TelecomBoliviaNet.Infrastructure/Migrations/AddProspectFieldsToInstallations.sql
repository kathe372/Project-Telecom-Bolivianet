-- Fase 1 (nivel comercial): identidad del prospecto en Installations.
-- Respaldo manual para Railway si la migración EF 20260715000001 no se aplica
-- (gotcha conocido: aplicar por SQL directo y registrar en __EFMigrationsHistory).

ALTER TABLE "Installations"
    ADD COLUMN IF NOT EXISTS "ProspectName"  character varying(200) NULL,
    ADD COLUMN IF NOT EXISTS "ProspectPhone" character varying(30)  NULL;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
SELECT '20260715000001_AddProspectFieldsToInstallations', '8.0.0'
WHERE NOT EXISTS (
    SELECT 1 FROM "__EFMigrationsHistory"
    WHERE "MigrationId" = '20260715000001_AddProspectFieldsToInstallations'
);
