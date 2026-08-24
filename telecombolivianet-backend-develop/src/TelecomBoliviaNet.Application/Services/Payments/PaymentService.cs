using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using System.Text.Json;
using TelecomBoliviaNet.Application.Constants;
using TelecomBoliviaNet.Application.DTOs.Common;
using TelecomBoliviaNet.Application.DTOs.Payments;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Notifications;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;
using TelecomBoliviaNet.Domain.Services;

#pragma warning disable CS8981
using r = TelecomBoliviaNet.Domain.Primitives.Result;
#pragma warning restore CS8981

namespace TelecomBoliviaNet.Application.Services.Payments;

public class PaymentService : IPaymentService
{
    private readonly IGenericRepository<Payment>        _paymentRepo;
    private readonly IGenericRepository<Invoice>        _invoiceRepo;
    private readonly IGenericRepository<Client>         _clientRepo;
    private readonly IGenericRepository<PaymentInvoice> _piRepo;
    private readonly IGenericRepository<CreditMovement> _creditMovementRepo;
    private readonly ICreditLedger                      _creditLedger;
    private readonly IFileStorage                       _fileStorage;
    private readonly INotifPublisher                    _notif;
    private readonly AuditService                       _audit;
    private readonly IUnitOfWork                        _uow;
    private readonly ILogger<PaymentService>            _logger;
    private readonly IGenericRepository<UserSystem>     _userRepo;

    public PaymentService(
        IGenericRepository<Payment>        paymentRepo,
        IGenericRepository<Invoice>        invoiceRepo,
        IGenericRepository<Client>         clientRepo,
        IGenericRepository<PaymentInvoice> piRepo,
        IGenericRepository<CreditMovement> creditMovementRepo,
        ICreditLedger                      creditLedger,
        IFileStorage                       fileStorage,
        INotifPublisher                    notif,
        AuditService                       audit,
        IUnitOfWork                        uow,
        ILogger<PaymentService>            logger,
        IGenericRepository<UserSystem>     userRepo)
    {
        _paymentRepo        = paymentRepo;
        _invoiceRepo        = invoiceRepo;
        _clientRepo         = clientRepo;
        _piRepo             = piRepo;
        _creditMovementRepo = creditMovementRepo;
        _creditLedger       = creditLedger;
        _fileStorage        = fileStorage;
        _notif              = notif;
        _audit              = audit;
        _uow                = uow;
        _logger             = logger;
        _userRepo           = userRepo;
    }


    public async Task<PagedResult<PaymentListItemDto>> GetAllAsync(PaymentFilterDto filter)
    {
        var query = _paymentRepo.GetAll()
            .Include(p => p.Client).ThenInclude(c => c!.Plan)
            .Include(p => p.RegisteredBy)
            .Include(p => p.PaymentInvoices).ThenInclude(pi => pi.Invoice)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(filter.Search))
        {
            var q = filter.Search.ToLower();
            query = query.Where(p =>
                (p.Client != null && (p.Client.FullName.ToLower().Contains(q) ||
                                      p.Client.TbnCode.ToLower().Contains(q))));
        }

        if (!string.IsNullOrWhiteSpace(filter.Method) && filter.Method != "all")
            if (Enum.TryParse<PaymentMethod>(filter.Method, out var m))
                query = query.Where(p => p.Method == m);

        if (!string.IsNullOrWhiteSpace(filter.Origin))
        {
            var fromWa = filter.Origin == "WhatsApp";
            query = query.Where(p => p.FromWhatsApp == fromWa);
        }

        if (filter.From.HasValue)
            query = query.Where(p => p.PaidAt >= filter.From.Value.ToUniversalTime());

        if (filter.To.HasValue)
            query = query.Where(p => p.PaidAt <= filter.To.Value.ToUniversalTime().AddDays(1));

        query = query.OrderByDescending(p => p.PaidAt);

        var total    = await query.CountAsync();
        var payments = await query
            .Skip((filter.PageNumber - 1) * filter.PageSize)
            .Take(filter.PageSize)
            .ToListAsync();

        return new PagedResult<PaymentListItemDto>(
            payments.Select(MapToListItem), total, filter.PageNumber, filter.PageSize);
    }


    public async Task<PaymentDetailDto?> GetByIdAsync(Guid id)
    {
        var p = await _paymentRepo.GetAll()
            .Include(p => p.Client)
            .Include(p => p.RegisteredBy)
            .Include(p => p.PaymentInvoices).ThenInclude(pi => pi.Invoice)
            .FirstOrDefaultAsync(p => p.Id == id);

        if (p is null) return null;

        // Misma constante que usa la validación real de VoidPaymentAsync. Antes
        // aquí había un 30 literal: si alguien cambiaba VoidPaymentWindowDays, la
        // UI seguía ofreciendo "Anular" durante 30 días y el backend lo rechazaba.
        var canVoid  = (DateTime.UtcNow - p.RegisteredAt).TotalDays
                       <= AppConstants.Security.VoidPaymentWindowDays;
        var isVoided = p.IsVoided;
        return new PaymentDetailDto(
            p.Id, p.ClientId,
            p.Client?.TbnCode   ?? "—",
            p.Client?.FullName  ?? "—",
            p.Client?.PhoneMain ?? "—",
            p.Amount, p.Method.ToString(), p.Bank, p.BankReference,
            p.PaidAt, p.RegisteredAt,
            p.RegisteredBy?.FullName ?? "Sistema",
            p.FromWhatsApp, p.ReceiptImageUrl, p.PhysicalReceiptNumber,
            BuildCoveredMonths(p), canVoid, isVoided);
    }


    // BUG-10 (auditoría 2026-08-06): aquí vivía una segunda AttachReceiptImageAsync que llamaba
    // a _fileStorage.SaveAsync(stream, fileName, contentType) — el tercer parámetro es la
    // CARPETA, no el content type, así que los comprobantes acababan en rutas como
    // /uploads/image/jpeg/… y el '/' del MIME creaba subcarpetas anidadas. La implementación
    // correcta (con saneado del nombre y manejo de errores de subida) siempre estuvo en
    // ReceiptImageService; simplemente nadie la inyectaba. Se elimina la copia.


    public async Task<Result<VoidPaymentResultDto>> VoidPaymentAsync(
        Guid paymentId, string justification, Guid actorId, string actorName, string ip)
    {
        if (justification.Trim().Length < 10)
            return Result<VoidPaymentResultDto>.Failure(
                "La justificación debe tener al menos 10 caracteres.");

        var payment = await _paymentRepo.GetAll()
            .Include(p => p.Client)
            .Include(p => p.PaymentInvoices).ThenInclude(pi => pi.Invoice)
            .FirstOrDefaultAsync(p => p.Id == paymentId);

        if (payment is null)
            return Result<VoidPaymentResultDto>.Failure("Pago no encontrado.");

        if (payment.IsVoided)
            return Result<VoidPaymentResultDto>.Failure("Este pago ya fue anulado.");

        if ((DateTime.UtcNow - payment.RegisteredAt).TotalDays > AppConstants.Security.VoidPaymentWindowDays)
            return Result<VoidPaymentResultDto>.Failure(
                $"Solo se pueden anular pagos registrados en los últimos {AppConstants.Security.VoidPaymentWindowDays} días.");

        var now = DateTime.UtcNow;

        // Se recalcula cada factura a partir de los pagos que SIGUEN vigentes.
        // Antes se forzaba Pendiente/Vencida sin más: si otro pago también cubría
        // la factura, su aporte se perdía y la factura volvía a cobrarse entera.
        var affectedInvoiceIds = payment.PaymentInvoices.Select(pi => pi.InvoiceId).ToList();

        var liveLinks = await _piRepo.GetAll()
            .Include(pi => pi.Payment)
            .Where(pi => affectedInvoiceIds.Contains(pi.InvoiceId) &&
                         pi.PaymentId != paymentId &&
                         pi.Payment != null && !pi.Payment.IsVoided)
            .ToListAsync();

        var invoicesToRevert = new List<Invoice>();
        var inexactInvoices  = new List<string>();

        foreach (var link in payment.PaymentInvoices.Where(pi => pi.Invoice is not null))
        {
            var invoice = link.Invoice!;
            var live    = liveLinks
                .Where(l => l.InvoiceId == invoice.Id)
                .Select(l => l.AmountApplied)
                .ToList();

            var (newAmountPaid, newStatus, isExact) = PaymentReversalService.Recalculate(
                invoice.Amount, invoice.AmountPaid, link.AmountApplied, live,
                invoice.DueDate, now);

            invoice.AmountPaid = newAmountPaid;
            invoice.Status     = newStatus;
            invoice.UpdatedAt  = now;
            invoicesToRevert.Add(invoice);

            if (!isExact) inexactInvoices.Add(invoice.InvoiceNumber ?? invoice.Id.ToString());
        }

        if (inexactInvoices.Count > 0)
        {
            _logger.LogWarning(
                "Anulación del pago {PaymentId}: no se pudo determinar con exactitud el reparto " +
                "de {Count} factura(s) ({Invoices}) por tratarse de enlaces anteriores al registro " +
                "de importes aplicados. Revisar manualmente el saldo.",
                paymentId, inexactInvoices.Count, string.Join(", ", inexactInvoices));
        }

        int reverted = invoicesToRevert.Count;

        var creditReversal = await BuildCreditReversalAsync(payment);

        payment.IsVoided          = true;
        payment.VoidJustification = justification.Trim();
        payment.VoidedAt          = now;
        payment.VoidedByUserId    = actorId;

        await _uow.BeginTransactionAsync();
        try
        {
            _invoiceRepo.UpdateRange(invoicesToRevert);
            await _invoiceRepo.SaveChangesAsync();
            // El saldo a favor vuelve al estado previo al pago DENTRO de la misma transacción
            // que reabre las facturas: o se deshace todo el pago, o no se deshace nada.
            if (creditReversal.HasEffect && payment.Client is not null)
            {
                await _creditLedger.RecordAsync(
                    payment.Client, creditReversal.Amount, CreditMovementType.Reversion,
                    paymentId: payment.Id, createdByUserId: actorId,
                    notes: $"Reversión por anulación del pago de Bs. {payment.Amount:F2}");
                _clientRepo.Update(payment.Client);
            }

            _paymentRepo.Update(payment);

            await _paymentRepo.SaveChangesAsync();
            await _uow.CommitAsync();
        }
        catch (DbUpdateConcurrencyException ex)
        {
            // D-14: alguien tocó una de estas facturas entre que se leyeron y se
            // guardaron. Revertir sobre datos obsoletos falsearía el saldo, así que
            // se deshace todo y se pide reintentar — el operador verá la factura ya
            // actualizada al recargar.
            _logger.LogWarning(ex,
                "Anulación del pago {PaymentId}: una factura cambió durante la operación. " +
                "Rollback ejecutado, no se modificó nada.", paymentId);
            await _uow.RollbackAsync();
            return Result<VoidPaymentResultDto>.Failure(
                "Otra persona modificó una de las facturas de este pago mientras se anulaba. " +
                "Recarga la pantalla y vuelve a intentarlo.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al anular pago {PaymentId} — rollback ejecutado", paymentId);
            await _uow.RollbackAsync();
            return Result<VoidPaymentResultDto>.Failure(
                "Error al anular el pago. Los datos no fueron modificados.");
        }

        var tbn = payment.Client?.TbnCode ?? "—";

        await _audit.LogAsync("Pagos", "PAYMENT_VOIDED",
            $"Pago anulado: {tbn} — {justification}",
            userId: actorId, userName: actorName, ip: ip,
            prevData: JsonSerializer.Serialize(new { payment.Amount, Status = "Activo" }),
            newData:  JsonSerializer.Serialize(new { Amount = 0, Status = "Anulado", Justification = justification }));

        if (payment.Client is not null)
        {
            // Tipo propio: antes se abusaba de CONFIRMACION_PAGO metiendo
            // "Pago anulado…" en {{periodo}}, y el cliente recibía un mensaje
            // que CONFIRMABA el pago que se le acababa de anular.
            await _notif.PublishAsync(
                NotifType.PAGO_ANULADO,
                payment.Client.Id,
                payment.Client.PhoneMain,
                new Dictionary<string, string>
                {
                    ["nombre"] = payment.Client.FullName,
                    ["monto"]  = $"{payment.Amount:F2}",
                });
        }

        var mensaje = $"Pago anulado. {reverted} factura(s) volvieron a estado pendiente/vencida.";
        if (creditReversal.HasEffect)
        {
            mensaje += creditReversal.Amount > 0
                ? $" Se devolvieron Bs. {creditReversal.Amount:F2} al saldo a favor del cliente."
                : $" Se retiraron Bs. {Math.Abs(creditReversal.Amount):F2} del saldo a favor del cliente.";
        }

        return Result<VoidPaymentResultDto>.Success(new VoidPaymentResultDto(reverted, mensaje));
    }


    /// <summary>
    /// Cuánto saldo a favor hay que devolver (o retirar) para dejar al cliente como estaba antes
    /// del pago. Se deduce de los asientos que el propio pago generó en el libro mayor: no hace
    /// falta ningún dato nuevo, porque el ledger ya registra tanto el crédito consumido como el
    /// excedente acumulado, ambos ligados al <c>PaymentId</c>.
    /// </summary>
    private async Task<CreditReversal> BuildCreditReversalAsync(Payment payment)
    {
        if (payment.Client is null) return default;

        var movimientos = await _creditMovementRepo.GetAllReadOnly()
            .Where(m => m.PaymentId == payment.Id)
            .Select(m => m.Amount)
            .ToListAsync();

        if (movimientos.Count == 0) return default;

        var reversal = CreditReversalPolicy.Calculate(movimientos, payment.Client.CreditBalance);

        if (!reversal.IsComplete)
        {
            _logger.LogWarning(
                "Anulación del pago {PaymentId}: no se pudo retirar Bs. {Faltante:F2} del saldo a " +
                "favor de {TbnCode} porque ese excedente ya se consumió contra otra factura. " +
                "Revisar manualmente.",
                payment.Id, reversal.Unapplied, payment.Client.TbnCode);
        }

        return reversal;
    }


    private const int ReportMaxRows = 5_000;

    public async Task<CollectionReportDto> GetCollectionReportAsync(DateTime from, DateTime to)
    {
        var utcFrom = from.ToUniversalTime();
        var utcTo   = to.ToUniversalTime().AddDays(1);

        var baseQuery = _paymentRepo.GetAll()
            .AsNoTracking()
            .Where(p => p.PaidAt >= utcFrom && p.PaidAt < utcTo && !p.IsVoided);

        // Los totales se calculan en SQL sobre TODAS las filas del rango.
        // Antes se traían como mucho 5.000 pagos a memoria y se sumaba sobre ese
        // subconjunto: pasado ese umbral el reporte de recaudación devolvía
        // silenciosamente un total incorrecto, sin ninguna advertencia.
        var totals = await baseQuery
            .GroupBy(_ => 1)
            .Select(g => new
            {
                Total   = (decimal?)g.Sum(p => p.Amount) ?? 0m,
                Count   = g.Count(),
                Cash    = (decimal?)g.Where(p => p.Method == PaymentMethod.Efectivo).Sum(p => p.Amount) ?? 0m,
                Deposit = (decimal?)g.Where(p => p.Method == PaymentMethod.DepositoBancario).Sum(p => p.Amount) ?? 0m,
                Qr      = (decimal?)g.Where(p => p.Method == PaymentMethod.QR).Sum(p => p.Amount) ?? 0m,
            })
            .FirstOrDefaultAsync();

        var total = totals?.Total ?? 0m;
        var count = totals?.Count ?? 0;
        var avg   = count > 0 ? Math.Round(total / count, 2) : 0m;

        // El desglose por operador también se agrega en SQL.
        var byUser = await baseQuery
            .GroupBy(p => p.RegisteredBy != null ? p.RegisteredBy.FullName : "Sistema")
            .Select(g => new CollectionByUserDto(g.Key, g.Count(), g.Sum(p => p.Amount)))
            .OrderByDescending(u => u.Total)
            .ToListAsync();

        // El DETALLE sí se acota: es una lista para mostrar, no la base del total.
        var payments = await baseQuery
            .Include(p => p.Client).ThenInclude(c => c!.Plan)
            .Include(p => p.RegisteredBy)
            .Include(p => p.PaymentInvoices).ThenInclude(pi => pi.Invoice)
            .OrderByDescending(p => p.PaidAt)
            .Take(ReportMaxRows)
            .ToListAsync();

        if (count > ReportMaxRows)
        {
            _logger.LogInformation(
                "Reporte de recaudación {From:d}–{To:d}: {Count} pagos, detalle limitado a {Max}. " +
                "Los totales cubren el rango completo.", from, to, count, ReportMaxRows);
        }

        return new CollectionReportDto(
            from, to, total, count, avg,
            totals?.Cash ?? 0m, totals?.Deposit ?? 0m, totals?.Qr ?? 0m,
            byUser,
            payments.Select(MapToListItem));
    }


    public async Task<DuplicateCheckResultDto> CheckDuplicateAsync(
        Guid clientId, decimal amount, DateTime paidAt)
    {
        var threeDaysAgo = paidAt.AddDays(-3).ToUniversalTime();
        var paidAtUtc    = paidAt.ToUniversalTime().AddDays(1);

        var existing = await _paymentRepo.GetAll()
            .Include(p => p.RegisteredBy)
            .Where(p => p.ClientId == clientId
                     && p.Amount   == amount
                     && p.PaidAt   >= threeDaysAgo
                     && p.PaidAt   <= paidAtUtc
                     && p.Amount   > 0
                     // Un pago ANULADO no es un duplicado: sin este filtro, tras
                     // anular un pago mal registrado el sistema bloqueaba volver a
                     // registrarlo corregido.
                     && !p.IsVoided)
            .FirstOrDefaultAsync();

        if (existing is null)
            return new DuplicateCheckResultDto(false, null, null, null, null, null);

        return new DuplicateCheckResultDto(
            true, existing.Id, existing.PaidAt, existing.Amount,
            existing.Method.ToString(), existing.RegisteredBy?.FullName);
    }


    public async Task<ReminderJobResultDto> SendOverdueRemindersAsync(
        Guid? actorId = null, string actorName = "Sistema")
    {
        var overdueClients = await _clientRepo.GetAll()
            .Include(c => c.Invoices)
            .Where(c => (c.Status == ClientStatus.Activo || c.Status == ClientStatus.Suspendido)
                     && c.Invoices.Any(i => i.Status == InvoiceStatus.Vencida))
            .ToListAsync();

        int sent = 0, skipped = 0, errors = 0;

        foreach (var client in overdueClients)
        {
            try
            {
                var vencidas = client.Invoices.Where(i => i.Status == InvoiceStatus.Vencida).ToList();
                // Saldo remanente, no el monto bruto: quien abonó parte de una factura vencida
                // recibía un recordatorio reclamándole el importe completo.
                var deuda    = vencidas.Sum(i => i.Outstanding);
                var meses    = vencidas.Count;

                await _notif.PublishAsync(
                    NotifType.FACTURA_VENCIDA,
                    client.Id,
                    client.PhoneMain,
                    new Dictionary<string, string>
                    {
                        ["nombre"]  = client.FullName,
                        ["monto"]   = $"{deuda:F2}",
                        ["periodo"] = $"{meses} mes(es) vencido(s)",
                    },
                    referenciaId: vencidas.First().Id
                );
                sent++;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex,
                    "Error al encolar recordatorio de vencimiento para cliente {ClientId}",
                    client.Id);
                errors++;
            }
        }

        await _audit.LogAsync(
            "Pagos", "REMINDER_JOB_EXECUTED",
            $"Recordatorios encolados en outbox: {sent} clientes, {errors} errores",
            userId: actorId, userName: actorName,
            newData: JsonSerializer.Serialize(new { Enqueued = sent, Errors = errors }));

        return new ReminderJobResultDto(sent, skipped, errors,
            DateTime.UtcNow.ToString("dd/MM/yyyy HH:mm"));
    }


    private static PaymentListItemDto MapToListItem(Payment p) =>
        new(p.Id, p.ClientId,
            p.Client?.TbnCode       ?? "—",
            p.Client?.FullName      ?? "—",
            p.Amount, p.Method.ToString(), p.Bank, p.BankReference,
            p.PaidAt, p.RegisteredAt,
            p.RegisteredBy?.FullName ?? "Sistema",
            p.FromWhatsApp, p.ReceiptImageUrl, p.PhysicalReceiptNumber,
            BuildCoveredMonths(p),
            p.Client?.Plan?.Name    ?? "—",
            p.IsVoided);

    private static readonly System.Globalization.CultureInfo _esCulture =
        System.Globalization.CultureInfo.GetCultureInfo("es-BO");

    private static IEnumerable<string> BuildCoveredMonths(Payment p) =>
        p.PaymentInvoices.Select(pi =>
        {
            if (pi.Invoice?.Type == InvoiceType.Instalacion) return "Instalación";
            if (pi.Invoice is null) return "—";
            var s = new DateTime(pi.Invoice.Year, pi.Invoice.Month, 1)
                        .ToString("MMMM yyyy", _esCulture);
            return char.ToUpper(s[0]) + s[1..];
        });


    public async Task<Result<CollectionReportByOperatorDto>> GetCollectionByOperatorAsync(
        DateTime from, DateTime to, Guid? operatorId)
    {
        var utcFrom = from.ToUniversalTime();
        var utcTo   = to.ToUniversalTime().AddDays(1);

        var query = _paymentRepo.GetAll()
            .AsNoTracking()
            .Where(p => p.PaidAt >= utcFrom && p.PaidAt < utcTo && !p.IsVoided);

        if (operatorId.HasValue)
            query = query.Where(p => p.RegisteredByUserId == operatorId.Value);

        // Igual que en el reporte general: los totales se agregan en SQL sobre el
        // rango completo, y solo el detalle mostrado se limita.
        var totals = await query
            .GroupBy(_ => 1)
            .Select(g => new { Total = (decimal?)g.Sum(p => p.Amount) ?? 0m, Count = g.Count() })
            .FirstOrDefaultAsync();

        var payments = await query
            .Include(p => p.Client)
            .Include(p => p.RegisteredBy)
            .Include(p => p.PaymentInvoices).ThenInclude(pi => pi.Invoice)
            .OrderByDescending(p => p.PaidAt)
            .Take(ReportMaxRows)
            .ToListAsync();

        var operators = await _userRepo.GetAll()
            .AsNoTracking()
            .Where(u => !u.IsDeleted)
            .OrderBy(u => u.FullName)
            .Select(u => new OperatorDropdownDto(u.Id, u.FullName))
            .ToListAsync();

        return Result<CollectionReportByOperatorDto>.Success(new CollectionReportByOperatorDto(
            from, to,
            totals?.Total ?? 0m,
            totals?.Count ?? 0,
            operatorId.HasValue
                ? operators.FirstOrDefault(o => o.Id == operatorId.Value)?.Name
                : null,
            payments.Select(p => new PaymentReportRowDto(
                p.Id,
                p.Client?.TbnCode   ?? "—",
                p.Client?.FullName  ?? "—",
                p.Amount,
                p.Method.ToString(),
                p.Bank,
                p.BankReference,
                p.PaidAt,
                p.RegisteredBy?.FullName ?? "Sistema",
                p.PhysicalReceiptNumber,
                p.FromWhatsApp
            )).ToList(),
            operators
        ));
    }
}
