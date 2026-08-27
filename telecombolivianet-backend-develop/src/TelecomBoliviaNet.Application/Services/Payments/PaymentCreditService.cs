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

/// <summary>
/// Registrar un cobro aplicando el saldo a favor del cliente.
///
/// <para>Eran 344 líneas y doce dependencias que además repartían el importe
/// entre facturas, devolvían el crédito y consultaban recibos (F5). El reparto
/// vive en <see cref="PaymentAllocator"/>, la devolución en
/// <see cref="CreditRefundService"/> y el recibo en
/// <see cref="PaymentQueryService"/>.</para>
///
/// <para>Lo que queda sigue coordinando muchos colaboradores, y es lo que es: un
/// cobro toca el pago, las facturas, el libro mayor de crédito, el cliente, el
/// recibo, la auditoría, el aviso y el evento de dominio, todo dentro de una
/// transacción.</para>
/// </summary>
public class PaymentCreditService : IPaymentCreditService
{
    private readonly IGenericRepository<Payment>        _paymentRepo;
    private readonly IGenericRepository<Client>         _clientRepo;
    private readonly PaymentAllocator                   _allocator;
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
        IGenericRepository<Client>         clientRepo,
        PaymentAllocator                   allocator,
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
        _clientRepo  = clientRepo;
        _allocator   = allocator;
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

        var (invoices, error) = await _allocator.LoadAndValidateAsync(dto);
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

            var invoiceNumbers = await _allocator.ApplyAsync(
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

            _clientRepo.Update(client);

            await _clientRepo.SaveChangesAsync();
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
            await _receiptRepo.SaveChangesAsync();

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
    /// <summary>
    /// Cuánto excedente deja el pago y cuánto saldo previo hace falta consumir.
    ///
    /// D-15: el crédito solo se toca por lo que el EFECTIVO no alcanza a cubrir.
    /// Antes se devolvía <c>Math.Min(creditBalance, totalDebt)</c>, que informaba
    /// crédito consumido aunque el efectivo bastara: un cliente con Bs. 100 a favor
    /// que pagaba Bs. 50 sobre una deuda de Bs. 50 generaba un asiento de -50 y
    /// otro de +50. El saldo final salía bien —los dos se anulan— pero su historial
    /// de crédito mostraba dos movimientos que nunca ocurrieron, y ese historial es
    /// lo que el operador enseña cuando alguien pregunta de dónde salió su saldo.
    /// </summary>
    private static (decimal excedente, decimal creditoUsado) CalculateCredit(
        decimal amount, decimal creditBalance, decimal totalDebt)
    {
        // Solo se echa mano del saldo por la parte que el efectivo no cubre.
        var faltante    = totalDebt - amount;
        var creditoUsado = faltante <= 0m
            ? 0m
            : Math.Min(creditBalance, faltante);

        var effective = amount + creditBalance;
        var excedente = effective > totalDebt ? effective - totalDebt : 0m;

        return (excedente, creditoUsado);
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
}
