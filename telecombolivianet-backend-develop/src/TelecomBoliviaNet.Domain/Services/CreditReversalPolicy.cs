namespace TelecomBoliviaNet.Domain.Services;

/// <summary>
/// Qué hay que devolverle (o quitarle) al saldo a favor de un cliente cuando se anula un pago.
///
/// Un pago mueve el crédito en dos sentidos a la vez: consume saldo previo contra las facturas
/// (asiento negativo) y deja como excedente lo que sobró (asiento positivo). El libro mayor ya
/// guarda ambos hechos ligados al pago, así que deshacerlo es exactamente negar la suma de sus
/// movimientos — no hace falta guardar ningún dato nuevo.
///
/// Antes la anulación NO tocaba el saldo: si un cliente con Bs. 100 a favor pagaba Bs. 50 sobre
/// una deuda de Bs. 120 y luego se anulaba el pago, las facturas volvían a deber los 120
/// completos y sus 100 de saldo desaparecían. El cliente perdía ese dinero.
/// </summary>
public static class CreditReversalPolicy
{
    /// <param name="movimientosDelPago">
    /// Importes FIRMADOS de los asientos que generó el pago (negativos: crédito consumido;
    /// positivos: excedente acumulado).
    /// </param>
    /// <param name="saldoActual">Saldo a favor del cliente en este momento.</param>
    public static CreditReversal Calculate(
        IEnumerable<decimal> movimientosDelPago, decimal saldoActual)
    {
        var netoDelPago = movimientosDelPago.Sum();
        var ideal       = -netoDelPago;

        // El saldo no puede quedar negativo: si el excedente que dejó este pago ya se consumió
        // contra otra factura, no hay de dónde retirarlo. Se revierte hasta donde alcanza y se
        // informa el faltante para que quede revisión manual, en vez de dejar el saldo en rojo
        // (que rompería el libro mayor) o abortar la anulación (que dejaría vivo un pago
        // que el operador ya decidió anular).
        var aplicable = ideal;
        if (saldoActual + aplicable < 0m) aplicable = -saldoActual;

        return new CreditReversal(aplicable, ideal - aplicable);
    }
}

/// <param name="Amount">
/// Importe firmado a asentar: positivo devuelve saldo al cliente, negativo se lo retira.
/// </param>
/// <param name="Unapplied">
/// Parte que no pudo revertirse por falta de saldo. Distinto de cero ⇒ requiere revisión manual.
/// </param>
public readonly record struct CreditReversal(decimal Amount, decimal Unapplied)
{
    public bool HasEffect  => Amount != 0m;
    public bool IsComplete => Unapplied == 0m;
}
