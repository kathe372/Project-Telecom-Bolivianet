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
    /// <summary>Estado efectivo considerando la fecha de vencimiento.</summary>
    /// <remarks>
    /// Cuándo está vencida no se decide aquí: lo dice <see cref="OverduePolicy"/>,
    /// que es la misma regla que aplica el job de marcado y la que filtra la
    /// consulta. Antes esta clase llevaba su propia copia de la lista de estados
    /// vencibles y ya había divergido — se le había quedado sin
    /// ParcialmentePagada.
    /// </remarks>
    public static InvoiceStatus Effective(Invoice invoice, DateTime now)
        => OverduePolicy.EstaVencida(invoice.Status, invoice.DueDate, now)
            ? InvoiceStatus.Vencida
            : invoice.Status;

    /// <summary>Nombre del estado efectivo (para DTOs de UI).</summary>
    public static string EffectiveName(Invoice invoice, DateTime now)
        => Effective(invoice, now).ToString();
}
