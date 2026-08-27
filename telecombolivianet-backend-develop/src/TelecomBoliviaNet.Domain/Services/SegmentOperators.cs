namespace TelecomBoliviaNet.Domain.Services;

/// <summary>
/// Los operadores con los que se comparan las condiciones de un segmento de
/// notificaciones — lo que decide a qué clientes les llega un envío masivo.
///
/// <para>Eran dos métodos privados dentro de <c>NotifShared</c> (F5), sin ningún
/// test. Deciden a quién se le manda un WhatsApp, así que conviene que su
/// comportamiento —incluido el de los casos raros— esté escrito y comprobado.</para>
/// </summary>
public static class SegmentOperators
{
    /// <summary>Operadores admitidos sobre texto. Deliberadamente solo dos.</summary>
    public static readonly string[] TextOperators = ["=", "!="];

    /// <summary>Operadores admitidos sobre números.</summary>
    public static readonly string[] NumberOperators = ["=", "!=", ">", "<", ">=", "<="];

    /// <summary>
    /// Compara texto, ignorando mayúsculas.
    ///
    /// <para>Un operador no admitido devuelve <c>false</c>, no error: la condición
    /// simplemente no casa. <b>Ojo con la asimetría</b> —sobre texto solo valen
    /// <c>=</c> y <c>!=</c>, así que un segmento con <c>zona &gt; "Norte"</c> no
    /// alcanza a nadie y no avisa de nada. Es seguro (mejor no escribirle a
    /// nadie que a todos) pero silencioso.</para>
    /// </summary>
    public static bool Compare(string actual, string op, string valor)
        => op switch
        {
            "="  => actual.Equals(valor, StringComparison.OrdinalIgnoreCase),
            "!=" => !actual.Equals(valor, StringComparison.OrdinalIgnoreCase),
            _    => false,
        };

    /// <summary>
    /// Compara números. Un operador no admitido devuelve <c>false</c>, igual que
    /// en la versión de texto.
    /// </summary>
    public static bool Compare(decimal actual, string op, decimal valor)
        => op switch
        {
            "="  => actual == valor,
            "!=" => actual != valor,
            ">"  => actual >  valor,
            "<"  => actual <  valor,
            ">=" => actual >= valor,
            "<=" => actual <= valor,
            _    => false,
        };

    /// <summary>
    /// ¿Es un operador que este campo entiende? Sirve para avisar al operador al
    /// guardar el segmento, en vez de dejar que descubra el problema porque el
    /// envío no alcanzó a nadie.
    /// </summary>
    public static bool IsSupported(string op, bool numericField)
        => (numericField ? NumberOperators : TextOperators).Contains(op);
}
