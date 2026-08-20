using System.Text;

namespace TelecomBoliviaNet.Application.Utils;

/// <summary>
/// Constructor de CSV compartido por todas las exportaciones del backend.
///
/// Existe porque cada endpoint que exportaba CSV lo armaba a mano y cada uno
/// se olvidaba de algo distinto: unos sin BOM (Excel mostraba "CÃ³digo" en vez
/// de "Código"), otros sin neutralizar las fórmulas (un nombre de cliente que
/// empieza con "=" se ejecuta al abrir el archivo — CSV injection).
/// </summary>
public sealed class CsvBuilder
{
    /// <summary>Excel solo interpreta un CSV como UTF-8 si encuentra el BOM.</summary>
    private static readonly UTF8Encoding Utf8WithBom = new(encoderShouldEmitUTF8Identifier: true);

    private readonly StringBuilder _sb = new();

    public CsvBuilder Row(params string?[] values)
    {
        _sb.AppendLine(string.Join(",", values.Select(Escape)));
        return this;
    }

    /// <summary>
    /// Encierra el valor entre comillas y neutraliza los caracteres con los que
    /// Excel arranca una fórmula, anteponiendo un apóstrofo.
    /// </summary>
    public static string Escape(string? value)
    {
        if (string.IsNullOrEmpty(value)) return "\"\"";

        if (value[0] is '=' or '+' or '-' or '@' or '\t' or '\r')
            value = "'" + value;

        return $"\"{value.Replace("\"", "\"\"")}\"";
    }

    public static string Money(decimal value) => value.ToString("F2");

    public byte[] ToBytes()
    {
        // Encoding.GetBytes NUNCA antepone el preámbulo, por muy configurado que
        // esté el encoding: hay que escribirlo a mano o el archivo sale sin BOM
        // y Excel vuelve a mostrar "CÃ³digo".
        var bom  = Utf8WithBom.GetPreamble();
        var body = Utf8WithBom.GetBytes(_sb.ToString());

        var result = new byte[bom.Length + body.Length];
        bom.CopyTo(result, 0);
        body.CopyTo(result, bom.Length);
        return result;
    }
}
