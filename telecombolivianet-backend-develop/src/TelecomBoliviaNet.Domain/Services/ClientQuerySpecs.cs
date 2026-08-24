using TelecomBoliviaNet.Domain.Entities.Clients;

namespace TelecomBoliviaNet.Domain.Services;

/// <summary>
/// Criterios de búsqueda de clientes expresados sobre <see cref="IQueryable{T}"/>.
///
/// <para>Vivían en <c>ClientProjectionHelpers</c> (capa Application) porque allí
/// se armaban las consultas. Con la Fase 4 las consultas se mudan al
/// repositorio, y estos predicados con ellas — son LINQ puro, sin EF Core, así
/// que Domain es su sitio y cualquier capa puede componerlos.</para>
///
/// <para>El filtro de deuda comparte con la columna de deuda de la grilla una
/// única definición de "impaga": <see cref="InvoiceDomainService.UnpaidStatuses"/>.
/// Esa constante —no la cercanía de los archivos— es lo que impide que filtro y
/// columna vuelvan a divergir, como pasó cuando cada pantalla escribía su
/// propio <c>Pendiente|Vencida</c>.</para>
/// </summary>
public static class ClientQuerySpecs
{
    /// <summary>Busca el término en nombre, código, CI, winbox, teléfonos, zona y email.</summary>
    public static IQueryable<Client> ApplyFullTextSearch(IQueryable<Client> query, string searchTerm)
    {
        var q = searchTerm.ToLower();
        return query.Where(c =>
            c.FullName.ToLower().Contains(q)     ||
            c.TbnCode.ToLower().Contains(q)      ||
            c.IdentityCard.ToLower().Contains(q) ||
            c.WinboxNumber.ToLower().Contains(q) ||
            c.PhoneMain.Contains(q)              ||
            c.Zone.ToLower().Contains(q)         ||
            (c.PhoneSecondary != null && c.PhoneSecondary.Contains(q)) ||
            (c.Email          != null && c.Email.ToLower().Contains(q)));
    }

    /// <param name="debtFilter">"debt", "paid" o cualquier otro valor (sin filtro).</param>
    public static IQueryable<Client> ApplyDebtFilter(IQueryable<Client> query, string? debtFilter)
    {
        if (string.IsNullOrWhiteSpace(debtFilter)) return query;

        var unpaid = InvoiceDomainService.UnpaidStatuses;
        return debtFilter switch
        {
            "debt" => query.Where(c => c.Invoices.Any(i => unpaid.Contains(i.Status))),
            "paid" => query.Where(c => !c.Invoices.Any(i => unpaid.Contains(i.Status))),
            _      => query,
        };
    }
}
