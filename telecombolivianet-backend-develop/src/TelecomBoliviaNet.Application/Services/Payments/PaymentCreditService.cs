using System.Globalization;
using MediatR;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.Interfaces;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using TelecomBoliviaNet.Application.DTOs.Payments;
using TelecomBoliviaNet.Application.Payments.Events;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Notifications;
using TelecomBoliviaNet.Domain.Entities.Payments;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;
#pragma warning disable CS8981
using r = TelecomBoliviaNet.Domain.Primitives.Result;
#pragma warning restore CS8981

namespace TelecomBoliviaNet.Application.Services.Payments;

public class PaymentCreditService : IPaymentCreditService
{
    private readonly IGenericRepository<Payment>        _paymentRepo;
    private readonly IGenericRepository<Invoice>        _invoiceRepo;
    private readonly IGenericRepository<Client>         _clientRepo;
    private readonly IGenericRepository<PaymentInvoice> _piRepo;
    private readonly IGenericRepository<PaymentReceipt> _receiptRepo;
    private readonly ISequenceGenerator                 _seqGen;
    private readonly INotifPublisher                    _notif;
    private readonly AuditService                       _audit;
    private readonly IUnitOfWork                        _uow;
    private readonly IPublisher                          _mediator;
    private readonly ICreditLedger                       _creditLedger;
    private readonly ILogger<PaymentCreditService>      _logger;

    public PaymentCreditService(
        IGenericRepository<Payment>        paymentRepo,
        IGenericRepository<Invoice>        invoiceRepo,
        IGenericRepository<Client>         clientRepo,
        IGenericRepository<PaymentInvoice> piRepo,
        IGenericRepository<PaymentReceipt> receiptRepo,
        ISequenceGenerator                 seqGen,
        INotifPublisher                    notif,
        AuditService                       audit,
        IUnitOfWork                        uow,
        IPublisher                         mediator,
        ICreditLedger                      creditLedger,
        ILogger<PaymentCreditService>      logger)
    {
        _paymentRepo = paymentRepo;
        _invoiceRepo = invoiceRepo;
        _clientRepo  = clientRepo;
        _piRepo      = piRepo;
        _receiptRepo = receiptRepo;
        _seqGen      = seqGen;
        _notif       = notif;
        _audit       = audit;
        _uow         = uow;
        _mediator     = mediator;
        _creditLedger = creditLedger;
        _logger       = logger;
    }

    public async Task<Result<PaymentRegisteredDto>> RegisterPaymentWithCreditAsync(
        RegisterPaymentDto dto, Guid actorId, string actorName, string ip)
    {
        var client = await _clientRepo.GetAll()
            .Include(c => c.Invoices)
            .FirstOrDefaultAsync(c => c.Id == dto.ClientId);
        if (client is null)
            return Result<PaymentRegisteredDto>.Failure("Cliente no encontrado.");

        var (invoices, error) = await LoadAndValidateInvoicesAsync(dto);
        if (invoices is null)
            return Result<PaymentRegisteredDto>.Failure(error!);

        var deudaTotal            = invoices.Sum(i => i.Outstanding);
        var (excedente, creditoUsado) = CalculateCredit(dto.Amount, client.CreditBalance, deudaTotal);
        var prevCredit            = client.CreditBalance;

        await _uow.BeginTransactionAsync();
        try
        {
            var payment = new Payment
            {
                ClientId              = dto.ClientId,
                Amount                = dto.Amount,
                Method                = Enum.TryParse<PaymentMethod>(dto.Method, ignoreCase: true, out var pm)
                    ? pm
                    : throw new ArgumentException($"Método de pago inválido: {dto.Method}"),
                Bank                  = dto.Bank,
                BankReference         = dto.BankReference,
                PaidAt                = dto.PaidAt.ToUniversalTime(),
                RegisteredAt          = DateTime.UtcNow,
                RegisteredByUserId    = actorId,
                PhysicalReceiptNumber = dto.PhysicalReceiptNumber,
            };
            await _paymentRepo.AddAsync(payment);

            var invoiceNumbers = await ApplyPaymentToInvoicesAsync(
                payment, invoices, dto.Amount + client.CreditBalance);

            // El saldo pasa de `prevCredit` a `excedente`, pero eso son DOS hechos
            // contables distintos: el crédito que se consumió contra las facturas y
            // el excedente nuevo que deja este pago. Se asientan por separado para
            // que el libro mayor explique el saldo, en vez de sobrescribirlo.
            if (creditoUsado > 0)
            {
                await _creditLedger.RecordAsync(
                    client, -creditoUsado, CreditMovementType.AplicadoAFactura,
                    paymentId: payment.Id, createdByUserId: actorId,
                    notes: $"Crédito aplicado junto al pago de Bs. {dto.Amount:F2}");
            }

            var excedenteNuevo = excedente - (prevCredit - creditoUsado);
            if (excedenteNuevo > 0)
            {
                await _creditLedger.RecordAsync(
                    client, excedenteNuevo, CreditMovementType.Acumulado,
                    paymentId: payment.Id, createdByUserId: actorId,
                    notes: $"Excedente del pago de Bs. {dto.Amount:F2}");
            }

            await _clientRepo.UpdateAsync(client);

            var receiptNumber = await _seqGen.NextReceiptNumberAsync();
            await _receiptRepo.AddAsync(new PaymentReceipt
            {
                ReceiptNumber     = receiptNumber,
                PaymentId         = payment.Id,
                ClientId          = dto.ClientId,
                GeneratedByUserId = actorId,
                Amount            = dto.Amount,
                Method            = dto.Method,
                Bank              = dto.Bank,
                PaidAt            = payment.PaidAt,
                InvoiceNumbers    = string.Join(", ", invoiceNumbers),
                PdfPath           = string.Empty,
                GeneratedAt       = DateTime.UtcNow,
            });

            // BUG preexistente corregido: el último guardado automático de este
            // método era `_clientRepo.UpdateAsync(client)`, unas líneas más arriba
            // — el recibo se añade DESPUÉS de eso, así que sin este guardado
            // explícito quedaba solo en el ChangeTracker en memoria y nunca
            // llegaba a la base. El pago se registraba "con éxito" pero
            // GetReceiptByPaymentAsync no encontraba ningún recibo.
            await _invoiceRepo.SaveChangesAsync();

            await _uow.CommitAsync();

            try { await PublishPaymentNotificationAsync(client, dto.Amount, invoices); }
            catch (Exception ex)
            {
                _logger.LogWarning(ex,
                    "Best-effort: fallo al publicar notificación de pago para cliente {TbnCode}",
                    client.TbnCode);
            }

            await _audit.LogAsync("Pagos", "PAYMENT_REGISTERED_WITH_CREDIT",
                $"Pago registrado: {client.TbnCode} monto={dto.Amount:F2} excedente={excedente:F2}",
                userId: actorId, userName: actorName, ip: ip,
                prevData: JsonSerializer.Serialize(new { PrevCredit = prevCredit }),
                newData:  JsonSerializer.Serialize(new { NewCredit = excedente, PaymentId = payment.Id }));

            // Best-effort: si el pago saldó la deuda de un suspendido, sugiere reactivación al admin.
            try { await _mediator.Publish(new PaymentRegisteredEvent(client.Id)); }
            catch (Exception ex)
            {
                _logger.LogWarning(ex,
                    "Best-effort: fallo al publicar PaymentRegisteredEvent para cliente {ClientId}",
                    client.Id);
            }

            return Result<PaymentRegisteredDto>.Success(new PaymentRegisteredDto(
                payment.Id, receiptNumber, dto.Amount, excedente, creditoUsado,
                $"Pago registrado. {(excedente > 0 ? $"Crédito a favor: Bs. {excedente:F2}" : string.Empty)}"));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "Error al registrar pago con crédito para cliente {ClientId} — rollback ejecutado",
                dto.ClientId);
            await _uow.RollbackAsync();
            return Result<PaymentRegisteredDto>.Failure(
                "Error al registrar el pago. La operación fue revertida completamente.");
        }
    }

    /// <summary>
    /// Carga las facturas del pago y comprueba que sean cobrables: que existan todas, que
    /// pertenezcan al cliente indicado y que ninguna esté ya liquidada.
    ///
    /// El rechazo de facturas ya pagadas o anuladas venía del handler del módulo de Clientes,
    /// que hasta la auditoría 2026-08-06 tenía su propia implementación del cobro (BUG-08). Al
    /// unificar ambos caminos en este servicio, la validación se conserva acá: seleccionar una
    /// factura saldada es un error del operador, y convertir ese dinero en saldo a favor sin
    /// avisar sería una sorpresa desagradable.
    /// </summary>
    private async Task<(List<Invoice>? Invoices, string? Error)> LoadAndValidateInvoicesAsync(
        RegisterPaymentDto dto)
    {
        if (dto.InvoiceIds.Count == 0)
            return (null, "Debe seleccionar al menos una factura.");

        var invoices = await _invoiceRepo.GetAll()
            .Where(i => dto.InvoiceIds.Contains(i.Id))
            .ToListAsync();

        if (invoices.Count != dto.InvoiceIds.Distinct().Count())
            return (null, "Una o más facturas no existen.");

        if (invoices.Any(i => i.ClientId != dto.ClientId))
            return (null, "Una o más facturas no pertenecen a este cliente.");

        if (invoices.Any(i => i.Status is InvoiceStatus.Pagada or InvoiceStatus.Anulada))
            return (null, "Una o más facturas seleccionadas ya están pagadas o anuladas.");

        return (invoices, null);
    }

    private static (decimal excedente, decimal creditoUsado) CalculateCredit(
        decimal amount, decimal creditBalance, decimal totalDebt)
    {
        var effective = amount + creditBalance;
        if (effective > totalDebt)
            return (effective - totalDebt, Math.Min(creditBalance, totalDebt));
        return (0m, Math.Min(creditBalance, effective));
    }

    private async Task<List<string>> ApplyPaymentToInvoicesAsync(
        Payment payment, List<Invoice> invoices, decimal effectiveAmount)
    {
        var invoiceNumbers = new List<string>();
        var remaining      = effectiveAmount;

        foreach (var inv in invoices.OrderBy(i => i.DueDate))
        {
            if (remaining <= 0) break;

            // Una factura ya saldada o anulada no admite más cobro: enlazarla
            // generaría un PaymentInvoice espurio y falsearía la conciliación.
            if (inv.Status is InvoiceStatus.Anulada or InvoiceStatus.Pagada) continue;

            var applied = Math.Min(inv.Amount - inv.AmountPaid, remaining);
            if (applied <= 0) continue;

            inv.AmountPaid += applied;
            remaining      -= applied;
            inv.Status    = inv.AmountPaid >= inv.Amount
                ? InvoiceStatus.Pagada
                : InvoiceStatus.ParcialmentePagada;
            inv.UpdatedAt = DateTime.UtcNow;

            // MarkModifiedAsync (no confirma) en vez de UpdateAsync (confirma cada
            // vez): con varias facturas por pago, UpdateAsync hacía un round-trip
            // de SaveChanges POR FACTURA. El guardado real ocurre una sola vez, al
            // final de RegisterPaymentWithCreditAsync, dentro de la misma
            // transacción que ya envuelve todo este método.
            await _invoiceRepo.MarkModifiedAsync(inv);

            // Se registra CUÁNTO se aplicó a esta factura: es lo que permite
            // revertir la anulación con exactitud cuando varios pagos la cubren.
            await _piRepo.AddAsync(new PaymentInvoice
            {
                PaymentId     = payment.Id,
                InvoiceId     = inv.Id,
                AmountApplied = applied,
            });
            if (inv.InvoiceNumber is not null) invoiceNumbers.Add(inv.InvoiceNumber);
        }

        return invoiceNumbers;
    }

    private async Task PublishPaymentNotificationAsync(
        Client client, decimal amount, List<Invoice> invoices)
    {
        var cultura     = new CultureInfo("es-BO");
        var periodoDesc = string.Join(", ", invoices.Select(i =>
            i.Type == InvoiceType.Instalacion
                ? "Instalación"
                : new DateTime(i.Year, i.Month, 1).ToString("MMMM yyyy", cultura)));
        await _notif.PublishAsync(
            NotifType.CONFIRMACION_PAGO,
            client.Id,
            client.PhoneMain,
            new Dictionary<string, string>
            {
                ["nombre"]  = client.FullName,
                ["monto"]   = $"{amount:F2}",
                ["periodo"] = periodoDesc.Length > 0 ? periodoDesc : "Varios periodos",
            });
    }

    public async Task<r> RefundCreditAsync(
        Guid clientId, string justificacion, Guid actorId, string actorName, string ip)
    {
        var client = await _clientRepo.GetByIdAsync(clientId);
        if (client is null) return Result.Failure("Cliente no encontrado.");
        if (client.CreditBalance <= 0) return Result.Failure("El cliente no tiene crédito a favor.");

        var prev = client.CreditBalance;

        // Antes esto era `client.CreditBalance = 0m` a secas: el saldo desaparecía
        // del sistema dejando solo una línea de auditoría en texto, sin asiento que
        // permitiera conciliar la devolución.
        await _creditLedger.RecordAsync(
            client, -prev, CreditMovementType.Reembolsado,
            createdByUserId: actorId,
            notes: $"Reembolso al cliente. Justificación: {justificacion}");

        await _clientRepo.UpdateAsync(client);

        await _audit.LogAsync("Pagos", "CREDIT_REIMBURSED",
            $"Crédito reembolsado: {client.TbnCode} monto={prev:F2} razón={justificacion}",
            userId: actorId, userName: actorName, ip: ip,
            prevData: JsonSerializer.Serialize(new { CreditBalance = prev }),
            newData:  JsonSerializer.Serialize(new { CreditBalance = 0m, Justificacion = justificacion }));

        return Result.Success();
    }

    public async Task<PaymentReceipt?> GetReceiptByPaymentAsync(Guid paymentId)
        => await _receiptRepo.GetAll().FirstOrDefaultAsync(r => r.PaymentId == paymentId);
}
