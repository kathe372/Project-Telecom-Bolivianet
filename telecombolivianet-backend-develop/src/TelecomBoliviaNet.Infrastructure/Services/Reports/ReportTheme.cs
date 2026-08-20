namespace TelecomBoliviaNet.Infrastructure.Services.Reports;

/// <summary>
/// Paleta y medidas de todos los reportes. Antes cada color hex estaba escrito a
/// mano decenas de veces dentro del generador; cambiar el azul de la marca
/// obligaba a buscar y reemplazar en 40 sitios.
/// </summary>
internal static class ReportTheme
{
    public const string Ink        = "#1A1A2E";
    public const string Muted      = "#6B7280";
    public const string Faint      = "#9CA3AF";
    public const string Line       = "#E5E7EB";
    public const string LineStrong = "#CBD5E1";
    public const string Surface    = "#F0F4F8";
    public const string ZebraRow   = "#F8FAFC";
    public const string White      = "#FFFFFF";

    public const string Positive = "#16A34A";
    public const string Warning  = "#D97706";
    public const string Danger   = "#DC2626";
    public const string Accent   = "#7C3AED";

    /// <summary>Azul oscuro de las cabeceras de tabla, derivado del color de marca.</summary>
    public const string TableHeader = "#1E3A8A";

    public const float FontBody   = 8f;
    public const float FontSmall  = 7f;
    public const float FontMicro  = 6.5f;

    /// <summary>
    /// Valida un color de marca configurable antes de pasárselo a QuestPDF, que
    /// lanza si el hex está mal formado. Un perfil mal cargado no puede tumbar la
    /// generación del reporte.
    /// </summary>
    public static string SafeColor(string? hex, string fallback = "#1D4ED8")
    {
        if (string.IsNullOrWhiteSpace(hex)) return fallback;

        var value = hex.Trim();
        if (value[0] != '#') value = "#" + value;
        if (value.Length != 7 && value.Length != 9) return fallback;

        return value.Skip(1).All(Uri.IsHexDigit) ? value : fallback;
    }
}
