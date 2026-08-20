using System.Globalization;
using Microsoft.EntityFrameworkCore;

using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.DTOs.Invoices;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Application.Utils;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Notifications;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;
using TelecomBoliviaNet.Domain.Services;

#pragma warning disable CS8981
using r = TelecomBoliviaNet.Domain.Primitives.Result;
#pragma warning restore CS8981

namespace TelecomBoliviaNet.Application.Services.Invoices;

// Antes esta clase implementaba CUATRO interfaces (IBillingJob, IBillingService,
// IBillingPreviewService, IBillingJobService) con métodos casi idénticos entre
// sí, todas registradas en DI apuntando a la misma instancia. Al revisar quién
// las inyectaba de verdad, solo IBillingService tenía un consumidor real
// (InvoicesController); las otras tres no las resolvía nadie — ni siquiera el
// job en segundo plano, que ya usaba la clase concreta. No era segregación de
// interfaces (ISP), era la misma clase disfrazada de cuatro.
public class BillingService : IBillingService
{
    private readonly IGenericRepository<Client>  _clientRepo;
    private readonly IGenericRepository<Invoice> _invoiceRepo;
    private readonly AuditService                _audit;
    private readonly ILogger<BillingService>     _logger;
    private readonly IInvoiceNumberService       _invNumSvc;
    private readonly INotifPublisher             _notif;
    private readonly IUnitOfWork                 _uow;
    private readonly ICreditLedger               _creditLedger;

    public BillingService(
        IGenericRepository<Client>  clientRepo,
        IGenericRepository<Invoice> invoiceRepo,
        AuditService                audit,
        ILogger<BillingService>     logger,
        IInvoiceNumberService       invNumSvc,
        INotifPublisher             notif,
        IUnitOfWork                 uow,
        ICreditLedger               creditLedger)
    {
        _clientRepo  = clientRepo;
        _invoiceRepo = invoiceRepo;
        _audit       = audit;
        _logger      = logger;
        _invNumSvc   = invNumSvc;
        _notif        = notif;
        _uow          = uow;
        _creditLedger = creditLedger;
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
                var (amount, notes) = CalculateMonthlyAmount(monthlyPrice, installDate, cursor.Year, cursor.Month);

                var dueDate = new DateTime(cursor.Year, cursor.Month, 5, 0, 0, 0, DateTimeKind.Utc);
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

    public async Task<BillingPreviewDto> GetBillingPreviewAsync(int year, int month)
    {
        var monthEnd = new DateTime(year, month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(1);
        var period   = $"{MonthName(month)} {year}";

        // Congelamiento: solo se factura a clientes facturables (activos), no a suspendidos.
        var billable = BillingEligibility.BillableStatuses;
        var clients = await _clientRepo.GetAll()
            .AsNoTracking()
            .Include(c => c.Plan)
            .Where(c => billable.Contains(c.Status) && c.InstallationDate < monthEnd)
            .ToListAsync();

        var existingClientIds = (await _invoiceRepo.GetAll()
            .AsNoTracking()
            .Where(i => i.Year == year && i.Month == month && i.Type == InvoiceType.Mensualidad)
            .Select(i => i.ClientId)
            .ToListAsync()).ToHashSet();

        int     toGenerate   = 0;
        int     alreadyBilled = 0;
        int     withErrors   = 0;
        decimal estimatedTotal = 0m;

        foreach (var client in clients)
        {
            if (existingClientIds.Contains(client.Id)) { alreadyBilled++; continue; }
            if (client.Plan is null)                   { withErrors++;    continue; }

            toGenerate++;
            estimatedTotal += client.Plan.MonthlyPrice;
        }

        int excludedBaja = await _clientRepo.GetAll()
            .CountAsync(c => c.Status == ClientStatus.DadoDeBaja);

        return new BillingPreviewDto(toGenerate, alreadyBilled, excludedBaja, withErrors, estimatedTotal, period);
    }


    public async Task<BillingJobResultDto> GenerateMonthlyInvoicesAsync(
        int year, int month, Guid? actorId = null, string actorName = "Sistema")
    {
        _logger.LogInformation("Facturación {Month}/{Year} iniciada", month, year);

        var monthEnd = new DateTime(year, month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(1);
        var dueDate  = new DateTime(year, month, 5, 0, 0, 0, DateTimeKind.Utc);
        var period   = $"{MonthName(month)} {year}";

        // Congelamiento: solo se factura a clientes facturables (activos), no a suspendidos.
        var billable = BillingEligibility.BillableStatuses;
        var clients = await _clientRepo.GetAll()
            .Include(c => c.Plan)
            .Where(c => billable.Contains(c.Status) && c.InstallationDate < monthEnd)
            .ToListAsync();

        var existingClientIds = (await _invoiceRepo.GetAll()
            .Where(i => i.Year == year && i.Month == month && i.Type == InvoiceType.Mensualidad)
            .Select(i => i.ClientId)
            .ToListAsync()).ToHashSet();

        int generated = 0, skipped = 0, excludedBaja = 0, errors = 0;
        var invoicesToCreate  = new List<Invoice>(clients.Count);
        var clientsToUpdate   = new List<Client>();
        // Crédito a asentar por cliente. Se registra dentro de la transacción,
        // junto con las facturas, para que saldo y asiento sean atómicos.
        var creditMovements   = new List<(Client Client, decimal Applied)>();

        foreach (var client in clients)
        {
            if (existingClientIds.Contains(client.Id)) { skipped++; continue; }

            if (client.Plan is null)
            {
                _logger.LogWarning("Cliente {TbnCode} sin plan, omitido", client.TbnCode);
                errors++;
                continue;
            }

            try
            {
                var (amount, notes) = CalculateMonthlyAmount(
                    client.Plan.MonthlyPrice, client.InstallationDate, year, month);

                var invNum = await _invNumSvc.NextInvoiceNumberAsync();

                var creditoAplicado = 0m;
                var amountFinal     = amount;
                if (client.CreditBalance > 0)
                {
                    creditoAplicado = Math.Min(client.CreditBalance, amount);
                    amountFinal     = amount - creditoAplicado;
                    // El libro mayor descuenta el saldo y deja el asiento; antes se
                    // restaba a mano y el consumo no quedaba registrado en ningún lado.
                    creditMovements.Add((client, creditoAplicado));
                    clientsToUpdate.Add(client);
                }

                var statusInicial = amountFinal <= 0
                    ? InvoiceStatus.Pagada
                    : InvoiceStatus.Emitida;

                invoicesToCreate.Add(new Invoice
                {
                    ClientId       = client.Id,
                    Type           = InvoiceType.Mensualidad,
                    Status         = statusInicial,
                    Year           = year,
                    Month          = month,
                    Amount         = amount,
                    AmountPaid     = creditoAplicado,
                    CreditApplied  = creditoAplicado,
                    IssuedAt       = DateTime.UtcNow,
                    DueDate        = dueDate,
                    Notes          = notes,
                    InvoiceNumber  = invNum,
                    PlanName       = client.Plan.Name,
                    PlanPrice      = client.Plan.MonthlyPrice,
                });

                generated++;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error preparando factura para {TbnCode}", client.TbnCode);
                errors++;
            }
        }

        // El descuento de crédito y la creación de facturas DEBEN ser atómicos.
        // Antes eran dos SaveChanges independientes (UpdateRangeAsync ya confirma
        // por su cuenta): si la inserción de facturas fallaba —por ejemplo al violar
        // el índice único (ClientId, Year, Month, Type) en una corrida concurrente—
        // el CreditBalance de los clientes ya había quedado descontado y las
        // facturas no existían. El cliente perdía su saldo a favor.
        if (clientsToUpdate.Count > 0 || invoicesToCreate.Count > 0)
        {
            await _uow.BeginTransactionAsync();
            try
            {
                // El asiento descuenta el saldo del cliente, así que va ANTES de
                // persistirlos: si esto falla, ni el crédito ni las facturas se guardan.
                foreach (var (client, applied) in creditMovements)
                {
                    await _creditLedger.RecordAsync(
                        client, -applied, CreditMovementType.AplicadoAFactura,
                        notes: $"Crédito aplicado a la facturación de {period}");
                }

                if (clientsToUpdate.Count > 0)
                    await _clientRepo.UpdateRangeAsync(clientsToUpdate);

                if (invoicesToCreate.Count > 0)
                {
                    await _invoiceRepo.AddRangeAsync(invoicesToCreate);
                    await _invoiceRepo.SaveChangesAsync();
                }

                await _uow.CommitAsync();
            }
            catch (Exception ex)
            {
                await _uow.RollbackAsync();
                _logger.LogError(ex,
                    "Facturación {Month}/{Year} revertida: no se generó ninguna factura y " +
                    "el crédito de los clientes quedó intacto.", month, year);
                throw;
            }
        }

        excludedBaja = await _clientRepo.GetAll()
            .CountAsync(c => c.Status == ClientStatus.DadoDeBaja);

        var result = new BillingJobResultDto(generated, skipped, excludedBaja, errors, period);

        await _audit.LogAsync(
            "Facturación", "BILLING_JOB_EXECUTED",
            $"Facturación {period}: {generated} generadas, {skipped} omitidas, {errors} errores",
            userId: actorId, userName: actorName,
            newData: System.Text.Json.JsonSerializer.Serialize(result));

        return result;
    }


    public async Task<int> MarkOverdueInvoicesAsync(
        Guid? actorId = null, string actorName = "Sistema")
    {
        var now = DateTime.UtcNow;

        var overdue = await _invoiceRepo.GetAll()
            .Where(i => InvoiceDomainService.OverdueEligible.Contains(i.Status) && i.DueDate < now)
            .ToListAsync();

        if (overdue.Count == 0) return 0;

        var porCliente = overdue.GroupBy(i => i.ClientId).ToList();

        foreach (var invoice in overdue)
        {
            invoice.Status    = InvoiceStatus.Vencida;
            invoice.UpdatedAt = now;
        }

        await _invoiceRepo.UpdateRangeAsync(overdue);

        var clientIds = porCliente.Select(g => g.Key).ToList();
        var clientsById = await _clientRepo.GetAll()
            .Include(c => c.Plan)
            .Where(c => clientIds.Contains(c.Id))
            .ToDictionaryAsync(c => c.Id);

        var cultura = new CultureInfo("es-BO");
        foreach (var grupo in porCliente)
        {
            clientsById.TryGetValue(grupo.Key, out var client);

            if (client is not null)
            {
                var saldoPendienteTotal = grupo.Sum(i => i.Amount - i.AmountPaid);
                var periodo = grupo.Count() == 1
                    ? new DateTime(grupo.First().Year, grupo.First().Month, 1).ToString("MMMM yyyy", cultura)
                    : $"{grupo.Count()} meses";

                await _notif.PublishAsync(
                    NotifType.FACTURA_VENCIDA,
                    client.Id,
                    client.PhoneMain,
                    new Dictionary<string, string>
                    {
                        ["nombre"]  = client.FullName,
                        ["monto"]   = $"{saldoPendienteTotal:F2}",
                        ["periodo"] = periodo,
                        ["plan"]    = client.Plan?.Name ?? "internet",
                    },
                    referenciaId: grupo.First().Id);
            }
        }

        await _audit.LogAsync(
            "Facturación", "OVERDUE_JOB_EXECUTED",
            $"{overdue.Count} facturas marcadas como vencidas al {now:dd/MM/yyyy}. Notificaciones encoladas: {porCliente.Count}.",
            userId: actorId, userName: actorName,
            newData: System.Text.Json.JsonSerializer.Serialize(new { Count = overdue.Count, Date = now }));

        return overdue.Count;
    }


    public async Task<r> VoidInvoiceAsync(
        Guid invoiceId, string justification, Guid actorId, string actorName, string ip)
    {
        var invoice = await _invoiceRepo.GetAll()
            .Include(i => i.Client)
            .FirstOrDefaultAsync(i => i.Id == invoiceId);

        if (invoice is null)                                   return Result.Failure("Factura no encontrada.");
        if (invoice.Status == InvoiceStatus.Pagada)            return Result.Failure("No se puede anular una factura pagada.");
        if (invoice.Status == InvoiceStatus.Anulada)           return Result.Failure("La factura ya está anulada.");
        if (justification.Trim().Length < 10)                  return Result.Failure("La justificación debe tener al menos 10 caracteres.");

        var prevStatus    = invoice.Status.ToString();
        invoice.Status    = InvoiceStatus.Anulada;
        // Se ANEXA en vez de sobrescribir: antes la justificación pisaba la nota
        // existente (p. ej. "Mes proporcional: 12 de 31 días"), destruyendo el
        // registro de cómo se calculó el importe.
        var anulacionNote = $"[ANULADA {DateTime.UtcNow:dd/MM/yyyy}] {justification.Trim()}";
        invoice.Notes     = string.IsNullOrWhiteSpace(invoice.Notes)
            ? anulacionNote
            : $"{invoice.Notes}\n{anulacionNote}";
        invoice.UpdatedAt = DateTime.UtcNow;
        await _invoiceRepo.UpdateAsync(invoice);

        await _audit.LogAsync(
            "Facturación", "INVOICE_VOIDED",
            $"Factura anulada: {invoice.Client?.TbnCode} — {MonthName(invoice.Month)} {invoice.Year}",
            userId: actorId, userName: actorName, ip: ip,
            prevData: System.Text.Json.JsonSerializer.Serialize(new { Status = prevStatus }),
            newData:  System.Text.Json.JsonSerializer.Serialize(new { Status = "Anulada", Justification = justification }));

        return Result.Success();
    }

    private static (decimal Amount, string? Notes) CalculateMonthlyAmount(
        decimal monthlyPrice, DateTime installDate, int year, int month)
    {
        bool isFirstMonth = installDate.Year == year && installDate.Month == month;
        if (!isFirstMonth)
            return (monthlyPrice, null);

        int daysInMonth   = DateTime.DaysInMonth(year, month);
        int remainingDays = daysInMonth - installDate.Day + 1;
        var amount        = Math.Round(monthlyPrice * remainingDays / daysInMonth, 2);
        return (amount, $"Mes proporcional: {remainingDays} de {daysInMonth} días");
    }

    private static string MonthName(int month) => InvoiceHelper.MonthName(month);
}
