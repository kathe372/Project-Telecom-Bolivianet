using Microsoft.EntityFrameworkCore;

using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.Constants;
using TelecomBoliviaNet.Application.DTOs.Invoices;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Application.Utils;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Services;

namespace TelecomBoliviaNet.Application.Services.Invoices;

// Antes esta clase implementaba CUATRO interfaces (IBillingJob, IBillingService,
// IBillingPreviewService, IBillingJobService) con métodos casi idénticos entre
// sí, todas registradas en DI apuntando a la misma instancia. Al revisar quién
// las inyectaba de verdad, solo IBillingService tenía un consumidor real
// (InvoicesController); las otras tres no las resolvía nadie — ni siquiera el
// job en segundo plano, que ya usaba la clase concreta. No era segregación de
// interfaces (ISP), era la misma clase disfrazada de cuatro.
//
// F5: además generaba las facturas retroactivas de un alta, marcaba vencidas en
// lote y anulaba facturas sueltas — 458 líneas para cuatro cosas distintas. Eso
// vive ahora en InvoiceBackfillService e InvoiceStatusService, y aquí queda solo
// el ciclo mensual: qué se emitiría este mes y emitirlo.
public class BillingService : IBillingService
{
    private readonly IGenericRepository<Client>  _clientRepo;
    private readonly IGenericRepository<Invoice> _invoiceRepo;
    private readonly AuditService                _audit;
    private readonly ILogger<BillingService>     _logger;
    private readonly IInvoiceNumberService       _invNumSvc;
    private readonly IUnitOfWork                 _uow;
    private readonly ICreditLedger               _creditLedger;

    public BillingService(
        IGenericRepository<Client>  clientRepo,
        IGenericRepository<Invoice> invoiceRepo,
        AuditService                audit,
        ILogger<BillingService>     logger,
        IInvoiceNumberService       invNumSvc,
        IUnitOfWork                 uow,
        ICreditLedger               creditLedger)
    {
        _clientRepo  = clientRepo;
        _invoiceRepo = invoiceRepo;
        _audit       = audit;
        _logger      = logger;
        _invNumSvc   = invNumSvc;
        _uow          = uow;
        _creditLedger = creditLedger;
    }



    public async Task<BillingPreviewDto> GetBillingPreviewAsync(int year, int month)
    {
        var monthEnd = new DateTime(year, month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(1);
        var period   = $"{MonthName(month)} {year}";

        // Congelamiento: solo se factura a clientes facturables (activos), no a suspendidos.
        var billable = BillingEligibility.BillableStatuses;

        // F7.4 — Los cuatro números se cuentan en SQL.
        //
        // Antes se traían a memoria TODOS los clientes facturables con su plan
        // —la ficha entera de cada uno— para recorrerlos en un foreach y contar.
        // Es una pantalla de "qué se va a facturar este mes": el coste crecía con
        // la cartera aunque el resultado sean cuatro enteros y un total.
        var yaFacturados = _invoiceRepo.GetAllReadOnly()
            .Where(i => i.Year == year && i.Month == month && i.Type == InvoiceType.Mensualidad)
            .Select(i => i.ClientId);

        var stats = await _clientRepo.GetAllReadOnly()
            .Where(c => billable.Contains(c.Status) && c.InstallationDate < monthEnd)
            .GroupBy(_ => 1)
            .Select(g => new
            {
                AlreadyBilled = g.Count(c => yaFacturados.Contains(c.Id)),
                // D-08: con la FK a Plans, un cliente sin plan no puede existir.
                // La rama se conserva —la caracterización congela que vale 0—
                // pero el contador nunca se moverá.
                WithErrors    = g.Count(c => !yaFacturados.Contains(c.Id) && c.Plan == null),
                ToGenerate    = g.Count(c => !yaFacturados.Contains(c.Id) && c.Plan != null),
                Estimated     = g.Where(c => !yaFacturados.Contains(c.Id) && c.Plan != null)
                                  .Sum(c => (decimal?)c.Plan!.MonthlyPrice),
            })
            .FirstOrDefaultAsync();

        var toGenerate     = stats?.ToGenerate    ?? 0;
        var alreadyBilled  = stats?.AlreadyBilled ?? 0;
        var withErrors     = stats?.WithErrors    ?? 0;
        var estimatedTotal = stats?.Estimated     ?? 0m;

        int excludedBaja = await _clientRepo.GetAll()
            .CountAsync(c => c.Status == ClientStatus.DadoDeBaja);

        return new BillingPreviewDto(toGenerate, alreadyBilled, excludedBaja, withErrors, estimatedTotal, period);
    }


    public async Task<BillingJobResultDto> GenerateMonthlyInvoicesAsync(
        int year, int month, Guid? actorId = null, string actorName = "Sistema")
    {
        _logger.LogInformation("Facturación {Month}/{Year} iniciada", month, year);

        var monthEnd = new DateTime(year, month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(1);
        var dueDate  = new DateTime(
            year, month, AppConstants.Billing.DueDayOfMonth, 0, 0, 0, DateTimeKind.Utc);
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
                var (amount, notes) = ProrationCalculator.FirstMonth(
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
                    _clientRepo.UpdateRange(clientsToUpdate);
                    await _clientRepo.SaveChangesAsync();
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


    private static string MonthName(int month) => InvoiceHelper.MonthName(month);
}
