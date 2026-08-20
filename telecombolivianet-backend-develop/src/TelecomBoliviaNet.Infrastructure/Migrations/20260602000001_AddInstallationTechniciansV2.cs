using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TelecomBoliviaNet.Infrastructure.Data;

#nullable disable

namespace TelecomBoliviaNet.Infrastructure.Migrations;

/// <summary>
/// Técnicos múltiples por instalación y por visita, más los campos que
/// necesitan (recordatorio, cancelación, duración y dotación por plan).
/// </summary>
/// <remarks>
/// 2026-08-20 — Reescrita como SQL idempotente. Motivo (ver ADR-004):
///
/// Esta migración carecía de <c>[DbContext(typeof(AppDbContext))]</c> y NO
/// estaba en MigrationsDbContextLink.cs, así que EF nunca la vio ni la aplicó:
/// sus cambios llegaron a producción por SQL directo. El síntoma era que
/// `MigrateAsync()` sobre una base limpia reventaba más adelante con
/// <c>42703: column "ReminderSentAt" of relation "Installations" does not
/// exist</c>, en el UPDATE de 20260715000002_NormalizeReprogramadaStatus.
///
/// Al devolverle la visibilidad, EF intentará aplicarla en el próximo despliegue
/// porque no consta en __EFMigrationsHistory. Por eso cada operación va con
/// IF NOT EXISTS: en producción no hace nada (los objetos ya existen) y en una
/// base nueva construye el esquema correcto. El SQL reproduce exactamente lo que
/// generaban las llamadas originales de MigrationBuilder.
/// </remarks>
[Migration("20260602000001_AddInstallationTechniciansV2")]
[DbContext(typeof(AppDbContext))]
public partial class AddInstallationTechniciansV2 : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // ── InstallationTechnicians ───────────────────────────────────────────
        migrationBuilder.Sql("""
            CREATE TABLE IF NOT EXISTS "InstallationTechnicians" (
                "Id"             uuid    NOT NULL,
                "InstallationId" uuid    NOT NULL,
                "TechnicianId"   uuid    NOT NULL,
                "IsLead"         boolean NOT NULL DEFAULT FALSE,
                "AssignedAt"     timestamp with time zone NOT NULL,
                "AssignedBy"     uuid    NOT NULL,
                CONSTRAINT "PK_InstallationTechnicians" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_InstallationTechnicians_Installations_InstallationId"
                    FOREIGN KEY ("InstallationId") REFERENCES "Installations" ("Id") ON DELETE CASCADE,
                CONSTRAINT "FK_InstallationTechnicians_UserSystems_TechnicianId"
                    FOREIGN KEY ("TechnicianId") REFERENCES "UserSystems" ("Id") ON DELETE RESTRICT
            );
            """);

        migrationBuilder.Sql("""
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_InstallationTechnicians_InstallationId_TechnicianId"
                ON "InstallationTechnicians" ("InstallationId", "TechnicianId");
            """);

        // ── VisitTechnicians ──────────────────────────────────────────────────
        migrationBuilder.Sql("""
            CREATE TABLE IF NOT EXISTS "VisitTechnicians" (
                "Id"           uuid    NOT NULL,
                "VisitId"      uuid    NOT NULL,
                "TechnicianId" uuid    NOT NULL,
                "IsLead"       boolean NOT NULL DEFAULT FALSE,
                "AssignedAt"   timestamp with time zone NOT NULL,
                "AssignedBy"   uuid    NOT NULL,
                CONSTRAINT "PK_VisitTechnicians" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_VisitTechnicians_TicketVisits_VisitId"
                    FOREIGN KEY ("VisitId") REFERENCES "TicketVisits" ("Id") ON DELETE CASCADE,
                CONSTRAINT "FK_VisitTechnicians_UserSystems_TechnicianId"
                    FOREIGN KEY ("TechnicianId") REFERENCES "UserSystems" ("Id") ON DELETE RESTRICT
            );
            """);

        migrationBuilder.Sql("""
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_VisitTechnicians_VisitId_TechnicianId"
                ON "VisitTechnicians" ("VisitId", "TechnicianId");
            """);

        // ── Campos nuevos ─────────────────────────────────────────────────────
        migrationBuilder.Sql("""
            ALTER TABLE "Installations" ADD COLUMN IF NOT EXISTS "ReminderSentAt" timestamp with time zone NULL;
            ALTER TABLE "Installations" ADD COLUMN IF NOT EXISTS "CanceladoAt"    timestamp with time zone NULL;
            ALTER TABLE "TicketVisits" ADD COLUMN IF NOT EXISTS "DuracionMin"     integer NOT NULL DEFAULT 60;
            ALTER TABLE "Plans"        ADD COLUMN IF NOT EXISTS "TecnicosRequeridos"     integer NOT NULL DEFAULT 1;
            ALTER TABLE "Plans"        ADD COLUMN IF NOT EXISTS "DuracionInstalacionMin" integer NOT NULL DEFAULT 120;
            """);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DROP TABLE IF EXISTS "InstallationTechnicians";
            DROP TABLE IF EXISTS "VisitTechnicians";

            ALTER TABLE "Installations" DROP COLUMN IF EXISTS "ReminderSentAt";
            ALTER TABLE "Installations" DROP COLUMN IF EXISTS "CanceladoAt";
            ALTER TABLE "TicketVisits" DROP COLUMN IF EXISTS "DuracionMin";
            ALTER TABLE "Plans"        DROP COLUMN IF EXISTS "TecnicosRequeridos";
            ALTER TABLE "Plans"        DROP COLUMN IF EXISTS "DuracionInstalacionMin";
            """);
    }
}
