namespace TelecomBoliviaNet.Application.Installations.Queries;

public static class SlotTimeGenerator
{
    /// <param name="bufferMin">
    /// Minutos de traslado entre slots consecutivos: el siguiente slot inicia
    /// bufferMin después de terminar el anterior para dar tiempo al técnico
    /// de llegar al próximo domicilio.
    /// </param>
    public static IEnumerable<(TimeOnly Inicio, TimeOnly Fin)> Generate(
        int startHour, int endHour, int duracionMin, int bufferMin = 0)
    {
        var current = new TimeOnly(startHour, 0);
        var end     = new TimeOnly(endHour,   0);

        while (current < end)
        {
            var next = current.AddMinutes(duracionMin);
            if (next > end) break;
            yield return (current, next);
            current = next.AddMinutes(Math.Max(0, bufferMin));
        }
    }
}
