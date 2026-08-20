using TelecomBoliviaNet.Application.DTOs.Admin;
using TelecomBoliviaNet.Application.Utils;

namespace TelecomBoliviaNet.Application.DTOs.Reports;

/// <summary>Un filtro que el usuario tenía aplicado al exportar, para dejarlo escrito en el documento.</summary>
public record ReportFilter(string Label, string Value);

/// <summary>
/// Todo lo que la cabecera de un reporte necesita saber, sin importar de qué
/// reporte se trate: quién es la empresa, qué documento es, qué período cubre,
/// qué filtros se aplicaron y quién lo generó.
///
/// Que el contexto sea común es lo que permite que facturación, cobranza,
/// deudores o tickets salgan con exactamente el mismo membrete.
/// </summary>
public record ReportContext(
    CompanyProfileDto        Company,
    string                   Title,
    string?                  Subtitle,
    string?                  PeriodLabel,
    IReadOnlyList<ReportFilter> Filters,
    string                   GeneratedBy,
    DateTime                 GeneratedAt,
    int                      RecordCount)
{
    /// <summary>
    /// Crea el contexto sellando la hora en zona boliviana. Nunca uses
    /// <c>DateTime.Now</c> aquí: el servidor corre en UTC.
    /// </summary>
    public static ReportContext Create(
        CompanyProfileDto company,
        string            title,
        string?           subtitle    = null,
        string?           periodLabel = null,
        IReadOnlyList<ReportFilter>? filters = null,
        string            generatedBy = "—",
        int               recordCount = 0)
        => new(company, title, subtitle, periodLabel,
               filters ?? Array.Empty<ReportFilter>(),
               generatedBy, BoliviaTime.Now, recordCount);

    /// <summary>Filtros en una línea: "Estado: Vencida · Tipo: Mensualidad".</summary>
    public string FiltersLine => Filters.Count == 0
        ? "Ninguno (todos los registros del período)"
        : string.Join("  ·  ", Filters.Select(f => $"{f.Label}: {f.Value}"));

    public string GeneratedAtText => GeneratedAt.ToString("dd/MM/yyyy 'a las' HH:mm");
}

/// <summary>Tarjeta de resumen de la franja superior (monto grande + conteo pequeño).</summary>
public record ReportSummaryCard(
    string  Label,
    string  Value,
    string? Caption,
    string  ColorHex,
    bool    Highlight = false);
