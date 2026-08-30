using TelecomBoliviaNet.Application.Constants;
namespace TelecomBoliviaNet.Application.Utils;

/// <summary>
/// Hora local de Bolivia (UTC-4 fijo, sin horario de verano).
///
/// El backend guarda todo en UTC y el contenedor de Railway corre en UTC, así que
/// <c>DateTime.Now</c> devuelve hora UTC, no hora boliviana. Cualquier fecha que
/// vaya a leer una persona —un reporte, un PDF, un mensaje de WhatsApp— tiene que
/// pasar por aquí; si no, sale 4 horas adelantada y, cerca de medianoche, con el
/// día cambiado.
/// </summary>
public static class BoliviaTime
{
    public static readonly TimeZoneInfo Zone =
        TimeZoneInfo.CreateCustomTimeZone("BOT", TimeSpan.FromHours(-4), "Bolivia Time", "BOT");

    /// <summary>Momento actual en hora boliviana.</summary>
    public static DateTime Now => TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, Zone);

    /// <summary>Convierte un instante UTC de la base de datos a hora boliviana.</summary>
    public static DateTime ToLocal(DateTime utc) =>
        TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), Zone);

    public static DateTime? ToLocal(DateTime? utc) =>
        utc.HasValue ? ToLocal(utc.Value) : null;

    /// <summary>Fecha local formateada, o <paramref name="fallback"/> si no hay valor.</summary>
    public static string Date(DateTime? utc, string fallback = AppConstants.Display.SinDato) =>
        utc.HasValue ? ToLocal(utc.Value).ToString("dd/MM/yyyy") : fallback;

    public static string DateTimeText(DateTime utc) =>
        ToLocal(utc).ToString("dd/MM/yyyy HH:mm");
}
