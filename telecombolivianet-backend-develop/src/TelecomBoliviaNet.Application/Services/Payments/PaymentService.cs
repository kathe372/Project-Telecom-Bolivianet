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

/// <summary>
/// Anulación de un cobro ya registrado.
///
/// <para>Era una clase de 565 líneas con 12 dependencias que además listaba,
/// consultaba, emitía dos informes y mandaba recordatorios (F5). Eso se fue a
/// <see cref="PaymentQueryService"/>, <see cref="PaymentReportService"/> y
/// <see cref="OverdueReminderService"/>; aquí queda una sola operación.</para>
///
/// <para>Sigue teniendo más de seis dependencias, y es deliberado: deshacer un
/// cobro toca el pago, sus facturas, los enlaces de otros pagos que también las
/// cubrían, el libro mayor de crédito, el cliente, la auditoría y el aviso al
/// cliente — todo dentro de una misma transacción. Partirlo más repartiría entre
/// cuatro clases una operación que debe ser atómica, que es peor problema que el
/// que resolvería.</para>
/// </summary>
public class PaymentService : IPaymentService
{
    private readonly IGenericRepository<Payment>        _paymentRepo;
    private readonly IGenericRepository<Invoice>        _invoiceRepo;
    private readonly IGenericRepository<Client>         _clientRepo;
    private readonly IGenericRepository<PaymentInvoice> _piRepo;
    private readonly CreditReversalCalculator           _creditReversal;
    private readonly ICreditLedger                      _creditLedger;
    private readonly INotifPublisher                    _notif;
    private readonly AuditService                       _audit;
    private readonly IUnitOfWork                        _uow;
    private readonly ILogger<PaymentService>            _logger;

    public PaymentService(
        IGenericRepository<Payment>        paymentRepo,
        IGenericRepository<Invoice>        invoiceRepo,
        IGenericRepository<Client>         clientRepo,
        IGenericRepository<PaymentInvoice> piRepo,
        CreditReversalCalculator           creditReversal,
        ICreditLedger                      creditLedger,
        INotifPublisher                    notif,
        AuditService                       audit,
        IUnitOfWork                        uow,
        ILogger<PaymentService>            logger)
    {
        _paymentRepo        = paymentRepo;
        _invoiceRepo        = invoiceRepo;
        _clientRepo         = clientRepo;
        _piRepo             = piRepo;
        _creditReversal     = creditReversal;
        _creditLedger       = creditLedger;
        _notif              = notif;
        _audit              = audit;
        _uow                = uow;
        _logger             = logger;
    }



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

        if (!PaymentVoidPolicy.IsWithinWindow(payment.RegisteredAt, DateTime.UtcNow))
            return Result<VoidPaymentResultDto>.Failure(
                $"Solo se pueden anular pagos registrados en los últimos {PaymentVoidPolicy.WindowDays} días.");

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

        var creditReversal = await _creditReversal.CalculateAsync(payment);

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

        var tbn = payment.Client?.TbnCode ?? AppConstants.Display.SinDato;

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
}
