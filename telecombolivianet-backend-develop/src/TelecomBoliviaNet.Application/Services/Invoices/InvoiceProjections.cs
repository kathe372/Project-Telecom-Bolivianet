using TelecomBoliviaNet.Application.DTOs.Invoices;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Services;
using TelecomBoliviaNet.Application.Constants;

namespace TelecomBoliviaNet.Application.Services.Invoices;

/// <summary>
/// Cómo se dibuja una factura en las pantallas de facturación.
///
/// <para>Eran métodos privados de <c>InvoiceQueryService</c>. Al partir esa clase
/// (F5) los necesitaban dos de las tres resultantes: la grilla los usa para la
/// ficha de cada fila y el informe anual para cada celda del calendario.</para>
/// </summary>
internal static class InvoiceProjections
{
    internal static readonly string[] MonthNames =
        ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun",
             "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

    internal static Payment? LivePaymentOf(Invoice invoice) =>
        invoice.PaymentInvoices
            .Select(pi => pi.Payment)
            .FirstOrDefault(p => p is not null && !p.IsVoided);

    internal static AnnualReportCellDto BuildCell(int month, string label, Invoice? invoice)
    {
        if (invoice is null)
            return new AnnualReportCellDto(month, label, "NoAplica", 0, null, null, null);

        var payment = LivePaymentOf(invoice);

        return new AnnualReportCellDto(
            month, label, InvoiceStatusResolver.EffectiveName(invoice, DateTime.UtcNow), invoice.Amount,
            payment?.Method.ToString(), payment?.PaidAt, invoice.Id);
    }


    internal static InvoiceDetailDto MapToDetail(Invoice i)
    {
        var payment = LivePaymentOf(i);

        return new InvoiceDetailDto(
            i.Id,
            i.ClientId,
            i.Client?.TbnCode    ?? AppConstants.Display.SinDato,
            i.Client?.FullName   ?? AppConstants.Display.SinDato,
            i.Client?.Plan?.Name ?? AppConstants.Display.SinDato,
            i.Type.ToString(),
            i.Status.ToString(),
            i.Year, i.Month, i.Amount,
            i.IssuedAt, i.DueDate, i.Notes, i.UpdatedAt,
            payment?.Method.ToString(),
            payment?.Bank,
            payment?.PaidAt,
            payment?.RegisteredBy?.FullName);
    }
}
