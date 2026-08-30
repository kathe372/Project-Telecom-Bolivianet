namespace TelecomBoliviaNet.Domain.Services;

/// <summary>
/// Cómo se busca a alguien por su teléfono cuando el número puede estar guardado
/// con o sin el prefijo de país.
/// </summary>
/// <remarks>
/// La regla estaba escrita dentro de <c>GetClientByPhoneQuery</c>, y el chatbot
/// tenía la suya propia en TypeScript. Al añadir la búsqueda de instalaciones por
/// teléfono (OBS-04) habría sido la tercera copia, así que vive aquí.
///
/// <para>El caso real: en Bolivia los números tienen 8 dígitos y WhatsApp los
/// entrega como <c>591XXXXXXXX</c>, pero en la ficha del cliente pueden estar
/// tecleados de las dos formas. Buscar solo por una deja fuera a la otra mitad
/// de la cartera.</para>
/// </remarks>
public static class PhoneLookup
{
    private const string PrefijoBolivia = "591";

    /// <summary>
    /// Las formas con las que buscar: la que llegó y, si traía prefijo, la de
    /// ocho dígitos. Sin duplicados y sin vacíos.
    /// </summary>
    public static string[] Candidatos(string? crudo)
    {
        var tal = (crudo ?? string.Empty).Trim();
        if (tal.Length == 0) return [];

        var sinPrefijo = tal.StartsWith(PrefijoBolivia) && tal.Length > PrefijoBolivia.Length
            ? tal[PrefijoBolivia.Length..]
            : tal;

        return sinPrefijo == tal ? [tal] : [sinPrefijo, tal];
    }

    /// <summary>¿Son el mismo número, con prefijo o sin él?</summary>
    public static bool EsElMismo(string? a, string? b)
    {
        var ca = Candidatos(a);
        var cb = Candidatos(b);
        return ca.Length > 0 && cb.Length > 0 && ca.Intersect(cb).Any();
    }
}
