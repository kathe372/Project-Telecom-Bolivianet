using System.Globalization;
using TelecomBoliviaNet.Application.DTOs.Payments;
using TelecomBoliviaNet.Domain.Entities.Clients;

namespace TelecomBoliviaNet.Application.Services.Payments;

/// <summary>
/// Proyección de un pago a la fila que muestran las pantallas.
///
/// <para>Vivía como métodos privados de <c>PaymentService</c>. Al partir ese
/// servicio (F5) lo necesitaban tres de las clases resultantes, y duplicarlo
/// habría sido justo lo que se quiere evitar: los meses cubiertos y el nombre
/// del operador tienen que leerse igual en el listado, en la ficha y en los dos
/// informes de recaudación.</para>
/// </summary>
internal static class PaymentMapper
{
    private static readonly CultureInfo EsBo = CultureInfo.GetCultureInfo("es-BO");

    internal static PaymentListItemDto ToListItem(Payment p) =>
        new(p.Id, p.ClientId,
            p.Client?.TbnCode       ?? "—",
            p.Client?.FullName      ?? "—",
            p.Amount, p.Method.ToString(), p.Bank, p.BankReference,
            p.PaidAt, p.RegisteredAt,
            p.RegisteredBy?.FullName ?? "Sistema",
            p.FromWhatsApp, p.ReceiptImageUrl, p.PhysicalReceiptNumber,
            CoveredMonths(p),
            p.Client?.Plan?.Name    ?? "—",
            p.IsVoided);

    /// <summary>
    /// Qué periodos saldó el pago, en texto. La factura de instalación no
    /// pertenece a ningún mes, así que se nombra por lo que es.
    /// </summary>
    internal static IEnumerable<string> CoveredMonths(Payment p) =>
        p.PaymentInvoices.Select(pi =>
        {
            if (pi.Invoice?.Type == InvoiceType.Instalacion) return "Instalación";
            if (pi.Invoice is null) return "—";
            var s = new DateTime(pi.Invoice.Year, pi.Invoice.Month, 1)
                        .ToString("MMMM yyyy", EsBo);
            return char.ToUpper(s[0]) + s[1..];
        });
}
