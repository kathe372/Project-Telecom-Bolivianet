using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TelecomBoliviaNet.Infrastructure.Data;

#nullable disable

namespace TelecomBoliviaNet.Infrastructure.Migrations
{
    /// <summary>
    /// Registra PaymentReceipts.GeneratedByUserId como FK real hacia UserSystems.
    /// </summary>
    /// <remarks>
    /// La migración 20260414000002 creó GeneratedByUserId sin FK ni índice, y EF
    /// generaba una propiedad sombra GeneratedById que no existía en la base:
    /// "column GeneratedById of relation PaymentReceipts does not exist".
    ///
    /// 2026-08-20 — Reescrita como SQL idempotente. Motivo (ver ADR-004): le
    /// faltaba <c>[DbContext(typeof(AppDbContext))]</c> y no estaba en
    /// MigrationsDbContextLink.cs, así que EF nunca la vio ni la aplicó. Al
    /// recuperar la visibilidad intentará ejecutarse en el próximo despliegue;
    /// siendo idempotente, en producción es un no-op.
    /// </remarks>
    [Migration("20260512000001_FixPaymentReceiptGeneratedByFK")]
    [DbContext(typeof(AppDbContext))]
    public partial class FixPaymentReceiptGeneratedByFK : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                CREATE INDEX IF NOT EXISTS "IX_PaymentReceipts_GeneratedByUserId"
                    ON "PaymentReceipts" ("GeneratedByUserId");
                """);

            // Las FK no admiten IF NOT EXISTS: se suelta y se vuelve a crear.
            migrationBuilder.Sql("""
                ALTER TABLE "PaymentReceipts"
                    DROP CONSTRAINT IF EXISTS "FK_PaymentReceipts_UserSystems_GeneratedByUserId";
                ALTER TABLE "PaymentReceipts"
                    ADD CONSTRAINT "FK_PaymentReceipts_UserSystems_GeneratedByUserId"
                    FOREIGN KEY ("GeneratedByUserId") REFERENCES "UserSystems" ("Id") ON DELETE RESTRICT;
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE "PaymentReceipts"
                    DROP CONSTRAINT IF EXISTS "FK_PaymentReceipts_UserSystems_GeneratedByUserId";
                DROP INDEX IF EXISTS "IX_PaymentReceipts_GeneratedByUserId";
                """);
        }
    }
}
