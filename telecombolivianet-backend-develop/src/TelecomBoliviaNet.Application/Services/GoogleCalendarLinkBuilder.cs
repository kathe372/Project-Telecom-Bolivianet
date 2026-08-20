using TelecomBoliviaNet.Domain.Entities.Installations;

namespace TelecomBoliviaNet.Application.Services;

public static class GoogleCalendarLinkBuilder
{
    public static string Build(Installation inst, string planName)
    {
        var inicio = DateTime.SpecifyKind(
            inst.Fecha.Date.Add(inst.HoraInicio.ToTimeSpan()), DateTimeKind.Utc);
        var fin = inicio.AddMinutes(inst.DuracionMin);

        var text    = Uri.EscapeDataString($"Instalación TBN – {planName}");
        var dates   = $"{inicio:yyyyMMddTHHmmssZ}/{fin:yyyyMMddTHHmmssZ}";
        var detail  = Uri.EscapeDataString($"Instalación de servicio TelecomBoliviaNet. Plan: {planName}");
        var loc     = Uri.EscapeDataString(inst.Direccion);

        return $"https://calendar.google.com/calendar/render" +
               $"?action=TEMPLATE&text={text}&dates={dates}&details={detail}&location={loc}";
    }
}
