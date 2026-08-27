using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.Constants;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Services;

namespace TelecomBoliviaNet.Application.Services.Invoices;

/// <summary>
/// Facturas retroactivas de un cliente que se da de alta con fecha de
/// instalación anterior: se emite una por cada mes transcurrido desde entonces.
///
/// <para>Extraído de <c>BillingService</c> (F5). No tiene nada que ver con el
/// ciclo mensual: aquí se rellena el pasado de UN cliente, allí se factura el
/// presente de TODOS. Compartían clase por costumbre, no por cohesión.</para>
/// </summary>
public class InvoiceBackfillService : IInvoiceBackfillService
{
    private readonly IGenericRepository<Invoice>       _invoiceRepo;
    private readonly IInvoiceNumberService             _invNumSvc;
    private readonly ILogger<InvoiceBackfillService>   _logger;

    public InvoiceBackfillService(
        IGenericRepository<Invoice>     invoiceRepo,
        IInvoiceNumberService           invNumSvc,
        ILogger<InvoiceBackfillService> logger)
    {
        _invoiceRepo = invoiceRepo;
        _invNumSvc   = invNumSvc;
        _logger      = logger;
    }

    public async Task GenerateBackfillInvoicesAsync(Client client, decimal monthlyPrice)
    {
        var installDate = client.InstallationDate;
        var today       = DateTime.UtcNow;

        var cursor   = new DateTime(installDate.Year, installDate.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var endMonth = new DateTime(today.Year,       today.Month,       1, 0, 0, 0, DateTimeKind.Utc);

        var existingMonths = await _invoiceRepo.GetAll()
            .Where(i => i.ClientId == client.Id && i.Type == InvoiceType.Mensualidad)
            .Select(i => new { i.Year, i.Month })
            .ToListAsync();

        var existingSet = existingMonths
            .Select(x => (x.Year, x.Month))
            .ToHashSet();

        var invoicesToCreate = new List<Invoice>();

        while (cursor <= endMonth)
        {
            if (!existingSet.Contains((cursor.Year, cursor.Month)))
            {
                var (amount, notes) = ProrationCalculator.FirstMonth(monthlyPrice, installDate, cursor.Year, cursor.Month);

                var dueDate = new DateTime(
                    cursor.Year, cursor.Month, AppConstants.Billing.DueDayOfMonth,
                    0, 0, 0, DateTimeKind.Utc);
                var status  = dueDate < DateTime.UtcNow
                    ? InvoiceStatus.Vencida
                    : InvoiceStatus.Pendiente;

                var invNumber = await _invNumSvc.NextInvoiceNumberAsync();
                invoicesToCreate.Add(new Invoice
                {
                    ClientId      = client.Id,
                    Type          = InvoiceType.Mensualidad,
                    Status        = status,
                    Year          = cursor.Year,
                    Month         = cursor.Month,
                    Amount        = amount,
                    IssuedAt      = DateTime.UtcNow,
                    DueDate       = dueDate,
                    Notes         = notes,
                    InvoiceNumber = invNumber,
                });
            }

            cursor = cursor.AddMonths(1);
        }

        if (invoicesToCreate.Count == 0)
        {
            _logger.LogInformation("Sin facturas retroactivas nuevas para {TbnCode}", client.TbnCode);
            return;
        }

        await _invoiceRepo.AddRangeAsync(invoicesToCreate);

        _logger.LogInformation(
            "Facturas retroactivas: {TbnCode} — {Count} facturas creadas (de {StartMonth}/{StartYear} a {EndMonth}/{EndYear})",
            client.TbnCode, invoicesToCreate.Count,
            installDate.Month, installDate.Year,
            today.Month, today.Year);
    }
}
