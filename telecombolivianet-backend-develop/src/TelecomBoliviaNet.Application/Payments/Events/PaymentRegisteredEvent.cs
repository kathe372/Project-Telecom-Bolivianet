using MediatR;

namespace TelecomBoliviaNet.Application.Payments.Events;

/// <summary>
/// Se publica tras registrar (y confirmar) un pago. Permite reaccionar de forma
/// desacoplada; hoy lo consume <see cref="SuggestReactivationOnDebtClearedHandler"/>.
/// </summary>
public record PaymentRegisteredEvent(Guid ClientId) : INotification;
