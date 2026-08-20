using TelecomBoliviaNet.Domain.Entities.Clients;

namespace TelecomBoliviaNet.Domain.Services;

/// <summary>
/// Calcula el estado "efectivo" de una factura para mostrarla en la UI.
///
/// Una factura impaga cuya fecha de vencimiento ya pasó se considera Vencida,
/// aunque el job de marcado (que corre periódicamente) todavía no la haya
/// persistido como tal. Así la interfaz nunca muestra "Pendiente" una factura
/// que en realidad ya venció, sin depender de la última corrida del job.
/// </summary>
public static class InvoiceStatusResolver
{
    // Se DERIVA de InvoiceDomainService.OverdueEligible en vez de repetir la lista: antes eran
    // dos literales que decían ser "los mismos" y ya habían divergido — el HashSet local se
    // quedó sin ParcialmentePagada. La única fuente de verdad es el servicio de dominio; acá
    // solo se indexa para consultarla en O(1).
    private static readonly HashSet<InvoiceStatus> OverdueEligible =
        new(InvoiceDomainService.OverdueEligible);

    /// <summary>Estado efectivo considerando la fecha de vencimiento.</summary>
    public static InvoiceStatus Effective(Invoice invoice, DateTime now)
        => OverdueEligible.Contains(invoice.Status) && invoice.DueDate < now
            ? InvoiceStatus.Vencida
            : invoice.Status;

    /// <summary>Nombre del estado efectivo (para DTOs de UI).</summary>
    public static string EffectiveName(Invoice invoice, DateTime now)
        => Effective(invoice, now).ToString();
}
