using TelecomBoliviaNet.Application.DTOs.Payments;
using TelecomBoliviaNet.Domain.Entities.Payments;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Interfaces;

/// <summary>
/// Registrar un cobro aplicando el saldo a favor del cliente. Devolver ese saldo
/// está en <see cref="ICreditRefundService"/>; el recibo, en
/// <see cref="IPaymentQueryService"/>.
/// </summary>
public interface IPaymentCreditService
{
    Task<Result<PaymentRegisteredDto>> RegisterPaymentWithCreditAsync(
        RegisterPaymentDto dto, Guid actorId, string actorName, string ip);
}

/// <summary>Devolver al cliente el saldo a favor que le queda.</summary>
public interface ICreditRefundService
{
    Task<Result> RefundCreditAsync(
        Guid clientId, string justificacion, Guid actorId, string actorName, string ip);
}
