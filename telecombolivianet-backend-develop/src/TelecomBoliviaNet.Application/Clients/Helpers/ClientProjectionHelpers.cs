using System.Globalization;
using TelecomBoliviaNet.Application.DTOs.Clients;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Services;

namespace TelecomBoliviaNet.Application.Clients.Helpers;

internal static class ClientProjectionHelpers
{
    private static readonly CultureInfo _es = CultureInfo.GetCultureInfo("es-BO");
    internal static IQueryable<Client> ApplyFullTextSearch(IQueryable<Client> query, string searchTerm)
    {
        var q = searchTerm.ToLower();
        return query.Where(c =>
            c.FullName.ToLower().Contains(q)     ||
            c.TbnCode.ToLower().Contains(q)      ||
            c.IdentityCard.ToLower().Contains(q) ||
            c.WinboxNumber.ToLower().Contains(q) ||
            c.PhoneMain.Contains(q)              ||
            c.Zone.ToLower().Contains(q)         ||
            (c.PhoneSecondary != null && c.PhoneSecondary.Contains(q)) ||
            (c.Email          != null && c.Email.ToLower().Contains(q)));
    }

    /// <summary>
    /// Filtra clientes por si tienen o no deuda, con la MISMA definición que usa la columna de
    /// deuda de la grilla (<see cref="CalcDebt"/> → <c>InvoiceDomainService.UnpaidStatuses</c>).
    ///
    /// Antes cada pantalla escribía su propio predicado <c>Pendiente|Vencida</c> mientras la
    /// columna ya usaba la fuente única: los primeros días del mes un cliente aparecía con
    /// "Bs. 149" en la grilla y desaparecía al marcar "Con deuda". Vive acá, junto a CalcDebt,
    /// para que filtro y columna no puedan volver a divergir.
    /// </summary>
    /// <param name="debtFilter">"debt", "paid" o cualquier otro valor (sin filtro).</param>
    internal static IQueryable<Client> ApplyDebtFilter(IQueryable<Client> query, string? debtFilter)
    {
        if (string.IsNullOrWhiteSpace(debtFilter)) return query;

        var unpaid = InvoiceDomainService.UnpaidStatuses;
        return debtFilter switch
        {
            "debt" => query.Where(c => c.Invoices.Any(i => unpaid.Contains(i.Status))),
            "paid" => query.Where(c => !c.Invoices.Any(i => unpaid.Contains(i.Status))),
            _      => query,
        };
    }

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
        CanVoid:  !p.IsVoided && (DateTime.UtcNow - p.RegisteredAt).TotalDays <= 30,
        IsVoided: p.IsVoided,
        p.PaymentInvoices.Select(pi =>
        {
            if (pi.Invoice?.Type == InvoiceType.Instalacion) return "Instalación";
            if (pi.Invoice is null) return "—";
            var s = new DateTime(pi.Invoice.Year, pi.Invoice.Month, 1).ToString("MMMM yyyy", _es);
            return char.ToUpper(s[0]) + s[1..];
        }));
}
