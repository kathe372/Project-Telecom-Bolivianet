namespace TelecomBoliviaNet.Domain.Services;

/// <summary>
/// Qué campos entiende una condición de segmento, y si una condición concreta
/// tiene sentido antes de guardarla.
/// </summary>
/// <remarks>
/// OBS-03 — Un segmento con <c>zona &gt; "Norte"</c> se guardaba sin protestar y
/// al evaluarlo no alcanzaba a nadie. Igual un <c>=&gt;</c> tecleado al revés, un
/// campo mal escrito, o <c>deuda &gt; "mucho"</c>. El comportamiento es seguro
/// —mejor no escribirle a nadie que a todos— pero <b>silencioso</b>: quien armó
/// el segmento no podía distinguir "mi regla está mal" de "no hay clientes que
/// cumplan", y se enteraba porque el envío masivo salió a cero personas.
///
/// <para>Estos campos son los mismos que interpreta
/// <c>NotifShared.EvaluaCondicion</c>. Son dos sitios y no se pueden unificar
/// —uno es un catálogo, el otro un <c>switch</c> sobre entidades cargadas— así
/// que van atados por <c>SegmentRulesTests</c>: si aparece un campo nuevo en uno
/// y no en el otro, ese test se pone rojo.</para>
/// </remarks>
public static class SegmentRules
{
    /// <summary>Campos de texto: solo admiten <c>=</c> y <c>!=</c>.</summary>
    public static readonly string[] CamposTexto = ["zona", "plan", "estado"];

    /// <summary>Campos numéricos: admiten los seis operadores.</summary>
    public static readonly string[] CamposNumericos = ["deuda", "dias_mora"];

    public static bool EsNumerico(string campo) => CamposNumericos.Contains(campo);
    public static bool Existe(string campo)     => EsNumerico(campo) || CamposTexto.Contains(campo);

    /// <summary>
    /// Qué está mal en esta condición, en lenguaje para quien la escribió.
    /// Lista vacía = la condición es válida.
    /// </summary>
    public static IReadOnlyList<string> Problemas(string? campo, string? operador, string? valor)
    {
        var problemas = new List<string>();
        campo    = campo?.Trim()    ?? "";
        operador = operador?.Trim() ?? "";

        if (!Existe(campo))
        {
            problemas.Add(
                $"El campo '{campo}' no existe. Los disponibles son: " +
                string.Join(", ", CamposTexto.Concat(CamposNumericos)) + ".");
            return problemas;   // sin campo válido, lo demás no se puede juzgar
        }

        var numerico = EsNumerico(campo);

        if (!SegmentOperators.IsSupported(operador, numerico))
        {
            var admitidos = numerico ? SegmentOperators.NumberOperators : SegmentOperators.TextOperators;
            problemas.Add(
                $"El operador '{operador}' no vale para '{campo}'. " +
                (numerico
                    ? $"Admite: {string.Join(" ", admitidos)}."
                    : $"'{campo}' es texto y solo admite {string.Join(" y ", admitidos)}; " +
                      "compararlo con mayor o menor no alcanzaría a nadie."));
        }

        if (numerico && !decimal.TryParse(valor, out _))
            problemas.Add($"'{campo}' compara números y '{valor}' no lo es.");

        return problemas;
    }
}
