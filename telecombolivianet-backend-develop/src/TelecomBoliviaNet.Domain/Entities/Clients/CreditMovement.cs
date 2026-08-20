using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Clients;

public enum CreditMovementType
{
    /// <summary>Un pago superó la deuda y el excedente quedó a favor del cliente.</summary>
    Acumulado           = 0,
    /// <summary>El saldo a favor se consumió contra una factura.</summary>
    AplicadoAFactura    = 1,
    /// <summary>El saldo se devolvió al cliente fuera del sistema.</summary>
    Reembolsado         = 2,
    /// <summary>Corrección manual del saldo.</summary>
    AjusteManual        = 3,
    /// <summary>Se revirtió un movimiento previo (p. ej. anulación de un pago).</summary>
    Reversion           = 4,
}

/// <summary>
/// Libro mayor del saldo a favor del cliente.
///
/// Antes `Client.CreditBalance` se sumaba y restaba directamente desde cuatro
/// sitios distintos y el único rastro era una entrada de auditoría en texto: el
/// saldo podía consumirse o reembolsarse sin que quedara ningún asiento, y no
/// había forma de conciliar por qué un cliente tenía el crédito que tenía.
///
/// Cada movimiento guarda el importe FIRMADO (+ acumula, − consume) y el saldo
/// resultante, de modo que la suma de los movimientos debe cuadrar siempre con
/// `Client.CreditBalance`.
/// </summary>
public class CreditMovement : Entity
{
    public Guid    ClientId { get; set; }
    public Client? Client   { get; set; }

    /// <summary>Importe firmado: positivo acumula saldo, negativo lo consume.</summary>
    public decimal Amount       { get; set; }

    /// <summary>Saldo del cliente inmediatamente después de este movimiento.</summary>
    public decimal BalanceAfter { get; set; }

    public CreditMovementType Type { get; set; }

    /// <summary>Pago que originó el movimiento, si lo hubo.</summary>
    public Guid? PaymentId { get; set; }

    /// <summary>Factura contra la que se aplicó el crédito, si la hubo.</summary>
    public Guid? InvoiceId { get; set; }

    public string? Notes { get; set; }

    public Guid?       CreatedByUserId { get; set; }
    public UserSystem? CreatedBy       { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
