using TelecomBoliviaNet.Domain.Entities.Clients;

namespace TelecomBoliviaNet.Domain.Services;

/// <summary>
/// Criterios de búsqueda de facturas expresados sobre <see cref="IQueryable{T}"/>.
///
/// <para>Era un método privado de <c>InvoiceQueryService</c>. Al partir esa clase
/// (F5) lo usaban las tres resultantes —los totales, la grilla y los informes—,
/// y es LINQ puro sin EF Core, así que su sitio es Domain. Mismo criterio que
/// <see cref="ClientQuerySpecs"/>.</para>
/// </summary>
public static class InvoiceQuerySpecs
{
    /// <summary>
    /// Acota por tipo de factura. Un valor vacío, <c>"all"</c> o un nombre que no
    /// corresponde a ningún tipo dejan la consulta como estaba: la pantalla manda
    /// el texto tal cual la eligió el operador y no debe romperse por eso.
    /// </summary>
    /// <param name="type">Nombre de <see cref="InvoiceType"/>, "all", o nulo.</param>
    public static IQueryable<Invoice> ApplyTypeFilter(IQueryable<Invoice> query, string? type)
    {
        if (string.IsNullOrWhiteSpace(type) || type.Equals("all", StringComparison.OrdinalIgnoreCase))
            return query;

        return Enum.TryParse<InvoiceType>(type, ignoreCase: true, out var parsed)
            ? query.Where(i => i.Type == parsed)
            : query;
    }
}
