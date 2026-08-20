using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TelecomBoliviaNet.Infrastructure.Data;

#nullable disable

namespace TelecomBoliviaNet.Infrastructure.Migrations;

/// <summary>
/// Auditoría 2026-08-01 — Fase 2.
///
/// `PaymentInvoices` solo registraba QUÉ pago cubrió QUÉ factura, no CUÁNTO se
/// aplicó a cada una. Sin ese dato era imposible revertir un pago con exactitud:
/// al anular, el sistema forzaba la factura a Pendiente/Vencida y borraba de un
/// plumazo lo aportado por los DEMÁS pagos que también la cubrían.
///
/// La columna es NULLABLE a propósito: en los enlaces anteriores a esta migración
/// el reparto real es desconocido y no puede inventarse. `null` significa
/// "enlace heredado sin reparto registrado" y el código de anulación cae a un
/// modo conservador para esos casos, en vez de calcular un importe falso.
/// </summary>
[Migration("20260801000001_AddPaymentInvoiceAmountApplied")]
[DbContext(typeof(AppDbContext))]
public partial class AddPaymentInvoiceAmountApplied : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<decimal>(
            name: "AmountApplied",
            table: "PaymentInvoices",
            type: "numeric(18,2)",
            nullable: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "AmountApplied", table: "PaymentInvoices");
    }
}
