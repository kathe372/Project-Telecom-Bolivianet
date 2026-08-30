using MediatR;
using TelecomBoliviaNet.Application.DTOs.Clients;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

using PaymentsDto = TelecomBoliviaNet.Application.DTOs.Payments;

namespace TelecomBoliviaNet.Application.Clients.Commands;

public record RegisterPaymentCommand(
    RegisterPaymentDto Dto,
    Guid               ActorId,
    string             ActorName,
    string             ClientIp) : IRequest<Result>;

/// <summary>
/// Registra un pago desde el módulo de Clientes (<c>POST /api/clients/{id}/payments</c>).
///
/// Este handler tenía su PROPIA implementación del cobro, con
/// reglas incompatibles con las del módulo de Pagos:
///   • marcaba TODA factura seleccionada como <c>Pagada</c> sin comparar el importe — registrar
///     Bs. 10 sobre una factura de Bs. 200 la dejaba saldada;
///   • no actualizaba <c>AmountPaid</c> ni guardaba <c>PaymentInvoice.AmountApplied</c>, con lo
///     que la anulación posterior caía en la rama "heredada" de PaymentReversalService y no
///     podía repartir con exactitud;
///   • ignoraba el saldo a favor del cliente y no generaba recibo.
/// Dos endpoints activos cobrando de forma distinta es una regla de negocio duplicada y ya
/// divergida. Ahora este caso de uso ORQUESTA y delega en el único servicio de cobro
/// (<see cref="IPaymentCreditService"/>), que aplica por antigüedad de vencimiento, consume
/// crédito, emite recibo y deja todo en una sola transacción.
/// </summary>
public class RegisterPaymentHandler : IRequestHandler<RegisterPaymentCommand, Result>
{
    private readonly IPaymentCreditService _paymentCredit;

    public RegisterPaymentHandler(IPaymentCreditService paymentCredit)
        => _paymentCredit = paymentCredit;

    public async Task<Result> Handle(RegisterPaymentCommand cmd, CancellationToken ct)
    {
        var result = await _paymentCredit.RegisterPaymentWithCreditAsync(
            ToPaymentsDto(cmd.Dto), cmd.ActorId, cmd.ActorName, cmd.ClientIp);

        return result.IsSuccess
            ? Result.Success()
            : Result.Failure(result.ErrorMessage);
    }

    /// <summary>
    /// Traduce el DTO del módulo de Clientes al del módulo de Pagos. Ambos describen el mismo
    /// hecho con los mismos campos; se mantienen separados para no acoplar los contratos
    /// públicos de dos módulos, y esta conversión es el único punto de contacto.
    /// </summary>
    private static PaymentsDto.RegisterPaymentDto ToPaymentsDto(RegisterPaymentDto dto) => new(
        ClientId:              dto.ClientId,
        Amount:                dto.Amount,
        Method:                dto.Method,
        Bank:                  dto.Bank,
        PaidAt:                dto.PaidAt,
        InvoiceIds:            dto.InvoiceIds,
        PhysicalReceiptNumber: dto.PhysicalReceiptNumber,
        BankReference:         dto.BankReference,
        ConfirmedDuplicate:    dto.ConfirmedDuplicate);
}
