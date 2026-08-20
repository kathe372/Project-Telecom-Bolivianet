using System.Text.RegularExpressions;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.ValueObjects;

public sealed record PhoneNumber
{
    private static readonly Regex _digits = new(@"\D", RegexOptions.Compiled);

    /// <summary>
    /// Formato CANÓNICO de almacenamiento de todo el sistema: el número local
    /// boliviano de 8 dígitos, sin prefijo de país.
    ///
    /// No es una preferencia de estilo, es lo que hay en las dos bases de datos:
    /// <c>Clients.PhoneMain</c> (183/183 registros) y <c>conversations.phone_number</c>
    /// del chatbot (153/155). El chatbot además normaliza a esta forma todo lo que
    /// entra por el webhook de Meta, y es el valor con el que envía mensajes.
    ///
    /// Existía un bug (D1) porque <c>BotProxyService</c> y <c>ChatbotDirectNotifier</c>
    /// hacían lo contrario: AGREGABAN el "591" antes de llamar al chatbot. Ese
    /// formato no lo usa ninguna de las dos bases, así que la búsqueda no
    /// encontraba la conversación (404) o creaba una fila duplicada. Consecuencia
    /// real en producción: las confirmaciones de pago por WhatsApp no llegaban.
    ///
    /// OJO con el constructor de este mismo record, más abajo: normaliza en la
    /// dirección OPUESTA (a "591XXXXXXXX", formato E.164 que espera la API de
    /// Meta). Hoy no se usa en ninguna parte del código. Si algún día se usa,
    /// tiene que quedar clarísimo cuál de las dos formas corresponde a cada
    /// frontera — la de almacenamiento es ESTA.
    /// </summary>
    public static string ToLocalCanonical(string? value)
    {
        var digits = _digits.Replace(value ?? string.Empty, "");
        return digits.Length == 11 && digits.StartsWith("591")
            ? digits[3..]
            : digits;
    }

    public string Value { get; }

    public PhoneNumber(string value)
    {
        var digits = _digits.Replace(value ?? string.Empty, "");

        if (digits.Length == 8 && (digits[0] == '6' || digits[0] == '7'))
            digits = "591" + digits;

        if (digits.Length != 11 || !digits.StartsWith("591"))
            throw new DomainException(
                $"Número boliviano inválido: '{value}'. " +
                "Formato esperado: 8 dígitos comenzando en 6 o 7 (ej: 71234567).");

        Value = digits;
    }

    public static implicit operator string(PhoneNumber p) => p.Value;
    public static implicit operator PhoneNumber(string s) => new(s);
    public override string ToString() => Value;
}
