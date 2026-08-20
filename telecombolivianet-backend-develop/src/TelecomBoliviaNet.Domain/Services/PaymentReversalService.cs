using TelecomBoliviaNet.Domain.Entities.Clients;

namespace TelecomBoliviaNet.Domain.Services;

/// <summary>
/// Recalcula el estado de una factura cuando se anula uno de los pagos que la
/// cubrían.
///
/// Antes la anulación forzaba la factura a Pendiente/Vencida sin mirar nada más:
/// si dos pagos la habían saldado y se anulaba uno, la factura quedaba marcada
/// como totalmente impaga y el aporte del OTRO pago desaparecía del registro.
/// Además `AmountPaid` no se tocaba, dejando facturas con saldo abonado > 0 y
/// estado "Pendiente" — un estado internamente contradictorio.
/// </summary>
public static class PaymentReversalService
{
    /// <param name="invoiceAmount">Importe total de la factura.</param>
    /// <param name="currentAmountPaid">Lo abonado según la factura hoy.</param>
    /// <param name="voidedApplied">
    /// Importe que aportaba el pago anulado, o <c>null</c> si es un enlace
    /// heredado sin reparto registrado.
    /// </param>
    /// <param name="liveApplied">
    /// Importes aportados por los pagos que SIGUEN vigentes sobre esta factura.
    /// </param>
    /// <returns>
    /// Nuevo importe abonado, nuevo estado, y si el cálculo pudo hacerse con
    /// exactitud (<c>false</c> ⇒ hay enlaces heredados y conviene revisión manual).
    /// </returns>
    public static (decimal AmountPaid, InvoiceStatus Status, bool IsExact) Recalculate(
        decimal                  invoiceAmount,
        decimal                  currentAmountPaid,
        decimal?                 voidedApplied,
        IReadOnlyList<decimal?>  liveApplied,
        DateTime                 dueDate,
        DateTime                 now)
    {
        decimal newAmountPaid;
        bool    isExact;

        if (liveApplied.All(a => a.HasValue))
        {
            // Caso normal: se conoce el reparto de todos los pagos vigentes, así
            // que el nuevo abonado es exactamente su suma. Con la lista vacía da
            // 0, que es justo lo correcto cuando el anulado era el único pago.
            newAmountPaid = liveApplied.Sum(a => a!.Value);
            isExact       = true;
        }
        else if (voidedApplied.HasValue)
        {
            // Se conoce lo que aportaba el anulado pero no el de algún vigente:
            // restarlo es correcto aunque no se pueda verificar contra el resto.
            newAmountPaid = Math.Max(0m, currentAmountPaid - voidedApplied.Value);
            isExact       = false;
        }
        else
        {
            // Enlaces heredados sin ningún reparto conocido: no hay forma honesta
            // de repartir. Se conserva el importe y se marca para revisión en vez
            // de inventar una cifra.
            newAmountPaid = currentAmountPaid;
            isExact       = false;
        }

        newAmountPaid = Math.Clamp(newAmountPaid, 0m, invoiceAmount);

        var status = InvoiceDomainService.CalculateStatus(invoiceAmount, newAmountPaid);

        // Si vuelve a quedar impaga y su vencimiento ya pasó, corresponde Vencida
        // sin esperar a la próxima corrida del job de marcado.
        if (InvoiceDomainService.OverdueEligible.Contains(status) && dueDate < now)
            status = InvoiceStatus.Vencida;

        return (newAmountPaid, status, isExact);
    }
}
