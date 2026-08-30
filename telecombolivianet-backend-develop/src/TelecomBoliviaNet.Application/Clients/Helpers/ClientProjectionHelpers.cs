using System.Globalization;
using TelecomBoliviaNet.Application.DTOs.Clients;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Services;
using TelecomBoliviaNet.Application.Constants;

namespace TelecomBoliviaNet.Application.Clients.Helpers;

internal static class ClientProjectionHelpers
{
    private static readonly CultureInfo _es = CultureInfo.GetCultureInfo("es-BO");

    // Los filtros sobre IQueryable (búsqueda y deuda) se mudaron a
    // Domain/Services/ClientQuerySpecs: ahora los aplica el repositorio, que es
    // quien arma la consulta. CalcDebt sigue acá porque opera en memoria, sobre
    // las facturas ya cargadas, y comparte con el filtro la misma definición de
    // "impaga" vía InvoiceDomainService.UnpaidStatuses.

    internal static decimal CalcDebt(IEnumerable<Invoice> invoices) =>
        invoices.Sum(i => i.Outstanding);

    internal static int CalcPendingMonths(IEnumerable<Invoice> invoices) =>
        invoices.Count(i => i.Type == InvoiceType.Mensualidad && i.IsUnpaid);

    internal static InvoiceDto MapInvoice(Invoice i) => new(
        i.Id, i.Type.ToString(), InvoiceStatusResolver.EffectiveName(i, DateTime.UtcNow),
        i.Year, i.Month, i.Amount, i.IssuedAt, i.DueDate, i.Notes, i.AmountPaid);

    internal static PaymentDto MapPaymentDto(Payment p) => new(
        p.Id, p.Amount, p.Method.ToString(), p.Bank, p.BankReference, p.PhysicalReceiptNumber,
        p.PaidAt, p.RegisteredAt,
        p.RegisteredBy?.FullName ?? "Sistema",
        p.FromWhatsApp,
        p.ReceiptImageUrl,
        CanVoid:  PaymentVoidPolicy.CanVoid(p.IsVoided, p.RegisteredAt, DateTime.UtcNow),
        IsVoided: p.IsVoided,
        p.PaymentInvoices.Select(pi =>
        {
            if (pi.Invoice?.Type == InvoiceType.Instalacion) return "Instalación";
            if (pi.Invoice is null) return AppConstants.Display.SinDato;
            var s = new DateTime(pi.Invoice.Year, pi.Invoice.Month, 1).ToString("MMMM yyyy", _es);
            return char.ToUpper(s[0]) + s[1..];
        }));
}
