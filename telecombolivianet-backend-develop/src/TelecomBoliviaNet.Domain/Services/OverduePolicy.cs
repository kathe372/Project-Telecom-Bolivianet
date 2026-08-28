using System.Linq.Expressions;
using TelecomBoliviaNet.Domain.Entities.Clients;

namespace TelecomBoliviaNet.Domain.Services;

/// <summary>
/// Cuándo una factura está vencida: se debe, y su fecha de vencimiento ya pasó.
/// </summary>
/// <remarks>
/// La regla estaba escrita CUATRO veces —el job de marcado, el estado efectivo
/// que ve la UI, la reversión de un pago anulado y ahora la consulta— y las
/// cuatro decían lo mismo. Cada una era correcta por su cuenta y ninguna estaba
/// atada a las otras: el día que cambiara la lista de estados vencibles,
/// cambiarían las que alguien recordara.
///
/// <para>Aquí vive en <b>dos formas</b>, y no hay manera de reducirlas a una:
/// <see cref="EstaVencida"/> decide sobre una factura que ya está en memoria, y
/// <see cref="VencidasAl"/> es el árbol de expresión que EF traduce a SQL para no
/// traerlas todas y filtrarlas después. Compilar la expresión en cada llamada
/// resolvería la duplicación a costa de hacerlo en cada fila de cada listado.</para>
///
/// <para>Como no se pueden unificar, se atan con un test: <c>OverduePolicyTests</c>
/// pasa la misma tabla de casos por las dos y exige el mismo veredicto. Si una
/// cambia y la otra no, ese test se pone rojo.</para>
/// </remarks>
public static class OverduePolicy
{
    // Indexado para consultar en O(1); la lista de verdad sigue siendo la del
    // servicio de dominio, que documenta por qué está cada estado.
    private static readonly HashSet<InvoiceStatus> Elegibles =
        new(InvoiceDomainService.OverdueEligible);

    /// <summary>La regla, sobre datos ya cargados.</summary>
    public static bool EstaVencida(InvoiceStatus status, DateTime dueDate, DateTime now)
        => Elegibles.Contains(status) && dueDate < now;

    /// <summary>La misma regla, para consultar la base sin traerla entera.</summary>
    public static Expression<Func<Invoice, bool>> VencidasAl(DateTime now)
        => i => InvoiceDomainService.OverdueEligible.Contains(i.Status) && i.DueDate < now;
}
