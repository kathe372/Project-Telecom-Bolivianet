-- ═══════════════════════════════════════════════════════════════════════════
-- F0.4 — Registrar en producción las migraciones que EF nunca vio
-- Fecha: 2026-08-20 · Plan: PLAN_MEJORA_TECNICA_2026-08.md · ADR-004
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CONTEXTO
-- Tres migraciones carecían de [DbContext(typeof(AppDbContext))] y no estaban
-- en MigrationsDbContextLink.cs, así que EF Core las ignoraba en silencio.
-- Sus cambios llegaron a producción por SQL directo, pero NO quedaron
-- registrados en __EFMigrationsHistory.
--
-- Al devolverles la visibilidad, EF las considera pendientes y las ejecutará en
-- el próximo despliegue. Se reescribieron como SQL idempotente, así que
-- ejecutarlas sería inocuo — este script es la segunda red de seguridad:
-- marcarlas como aplicadas para que EF ni las intente.
--
-- Se añade también la migración nueva 20260820000001_BackfillCoverageSupportTables,
-- que crea CoverageQueries/GeocodeCaches/NapPorts/PortReservations. Esas tablas
-- YA existen en producción (creadas por SQL directo), así que también se marca
-- como aplicada.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CUÁNDO EJECUTARLO
--   ANTES de desplegar el commit de la Fase 0.
--   Si se despliega sin ejecutarlo, no pasa nada grave: las migraciones son
--   idempotentes y se aplicarán como no-ops. Este script solo evita el ruido.
--
-- CÓMO
--   psql "$DATABASE_URL" -f docs/sql/F0-registrar-migraciones.sql
--
-- ES SEGURO REEJECUTARLO: usa ON CONFLICT DO NOTHING.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Diagnóstico previo: ¿cuáles de estas cuatro faltan?
--    (Ejecuta solo esta consulta primero si quieres ver el estado antes de tocar nada.)
SELECT m."MigrationId" AS ya_registrada
FROM "__EFMigrationsHistory" m
WHERE m."MigrationId" IN (
    '20260512000001_FixPaymentReceiptGeneratedByFK',
    '20260531000001_AddCoverageModule',
    '20260602000001_AddInstallationTechniciansV2',
    '20260820000001_BackfillCoverageSupportTables'
);

-- 2. Registrar las que falten.
--    ProductVersion se toma de una fila existente para no inventar un valor que
--    no corresponda a la versión de EF con la que se creó el historial.
INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
SELECT v."MigrationId",
       COALESCE(
           (SELECT h."ProductVersion" FROM "__EFMigrationsHistory" h
            ORDER BY h."MigrationId" DESC LIMIT 1),
           '8.0.11'
       )
FROM (VALUES
    ('20260512000001_FixPaymentReceiptGeneratedByFK'),
    ('20260531000001_AddCoverageModule'),
    ('20260602000001_AddInstallationTechniciansV2'),
    ('20260820000001_BackfillCoverageSupportTables')
) AS v("MigrationId")
ON CONFLICT ("MigrationId") DO NOTHING;

-- 3. Verificación: las cuatro deben aparecer.
SELECT m."MigrationId", m."ProductVersion"
FROM "__EFMigrationsHistory" m
WHERE m."MigrationId" IN (
    '20260512000001_FixPaymentReceiptGeneratedByFK',
    '20260531000001_AddCoverageModule',
    '20260602000001_AddInstallationTechniciansV2',
    '20260820000001_BackfillCoverageSupportTables'
)
ORDER BY m."MigrationId";

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- COMPROBACIÓN POSTERIOR (opcional, tras el despliegue)
-- El arranque de la app registra en el log las migraciones pendientes.
-- Debería decir 0 pendientes.
-- ═══════════════════════════════════════════════════════════════════════════
