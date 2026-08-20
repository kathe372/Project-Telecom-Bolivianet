using TelecomBoliviaNet.Domain.Entities.Clients;

namespace TelecomBoliviaNet.Application.Interfaces;

/// <summary>
/// Único punto por el que puede cambiar el saldo a favor de un cliente.
///
/// Antes `Client.CreditBalance` se asignaba a mano desde cuatro servicios
/// distintos, sin dejar asiento: no se podía explicar de dónde salía el saldo de
/// un cliente ni reconstruirlo. Aquí el ajuste del saldo y el asiento contable
/// ocurren siempre juntos.
///
/// No confirma la transacción: los movimientos se añaden al contexto y los
/// persiste el commit del llamador, para que el saldo y su asiento sean atómicos.
/// </summary>
public interface ICreditLedger
{
    /// <summary>
    /// Aplica un movimiento al saldo del cliente y registra el asiento.
    /// </summary>
    /// <param name="amount">
    /// Importe FIRMADO: positivo acumula saldo a favor, negativo lo consume.
    /// </param>
    /// <returns>El movimiento registrado, con el saldo resultante.</returns>
    Task<CreditMovement> RecordAsync(
        Client             client,
        decimal            amount,
        CreditMovementType type,
        Guid?              paymentId       = null,
        Guid?              invoiceId       = null,
        string?            notes           = null,
        Guid?              createdByUserId = null);
}
