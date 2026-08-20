using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TelecomBoliviaNet.Infrastructure.Data;

#nullable disable

namespace TelecomBoliviaNet.Infrastructure.Migrations;

/// <summary>
/// Auditoría 2026-08-01 — Fase 2.
///
/// Libro mayor del saldo a favor del cliente. Hasta ahora `Client.CreditBalance`
/// se modificaba directamente desde cuatro sitios y el crédito consumido o
/// reembolsado no dejaba ningún asiento: el dinero desaparecía del sistema con
/// solo una línea de auditoría en texto libre, imposible de conciliar.
/// </summary>
[Migration("20260801000002_AddCreditMovements")]
[DbContext(typeof(AppDbContext))]
public partial class AddCreditMovements : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "CreditMovements",
            columns: table => new
            {
                Id              = table.Column<Guid>(type: "uuid", nullable: false),
                ClientId        = table.Column<Guid>(type: "uuid", nullable: false),
                Amount          = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                BalanceAfter    = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                Type            = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                PaymentId       = table.Column<Guid>(type: "uuid", nullable: true),
                InvoiceId       = table.Column<Guid>(type: "uuid", nullable: true),
                Notes           = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                CreatedAt       = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
            },
            constraints: t =>
            {
                t.PrimaryKey("PK_CreditMovements", x => x.Id);
                t.ForeignKey("FK_CreditMovements_Clients_ClientId",
                    x => x.ClientId, "Clients", "Id", onDelete: ReferentialAction.Cascade);
                t.ForeignKey("FK_CreditMovements_UserSystems_CreatedByUserId",
                    x => x.CreatedByUserId, "UserSystems", "Id", onDelete: ReferentialAction.SetNull);
            });

        migrationBuilder.CreateIndex(
            "IX_CreditMovements_ClientId_CreatedAt", "CreditMovements",
            new[] { "ClientId", "CreatedAt" });
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "CreditMovements");
    }
}
