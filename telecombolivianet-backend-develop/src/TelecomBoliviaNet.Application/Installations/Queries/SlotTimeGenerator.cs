namespace TelecomBoliviaNet.Application.Installations.Queries;

/// <summary>
/// Las franjas de un día, según el horario de atención.
/// </summary>
public static class SlotTimeGenerator
{
    private const int MinutosPorDia = 24 * 60;

    /// <summary>El último minuto representable con <see cref="TimeOnly"/>: 23:59.</summary>
    private const int UltimoMinutoDelDia = MinutosPorDia - 1;

    /// <param name="endHour">
    /// Hora de cierre, de 1 a 24. El 24 significa medianoche y lo usan los
    /// horarios 24x7 (ver <c>BusinessSchedule.OpenHours</c>).
    /// </param>
    /// <param name="bufferMin">
    /// Minutos de traslado entre slots consecutivos: el siguiente slot inicia
    /// bufferMin después de terminar el anterior para dar tiempo al técnico
    /// de llegar al próximo domicilio.
    /// </param>
    /// <remarks>
    /// D-21 — Se calcula en MINUTOS desde medianoche, no con <see cref="TimeOnly"/>.
    ///
    /// <para>Antes hacía <c>new TimeOnly(endHour, 0)</c>, y con un horario 24x7
    /// —cuyo cierre son las 24— eso lanza <c>ArgumentOutOfRangeException</c>:
    /// <see cref="TimeOnly"/> llega hasta las 23:59. La consulta de huecos moría
    /// con un 500 en vez de devolver una lista.</para>
    ///
    /// <para>Y había un segundo problema del mismo origen: <c>AddMinutes</c> sobre
    /// <see cref="TimeOnly"/> <b>da la vuelta al reloj</b>. Un slot que se pasara
    /// de medianoche volvía a las 00:30 y seguía siendo "menor que el cierre", así
    /// que el bucle no paraba donde debía.</para>
    ///
    /// <para><b>Límite asumido y visible:</b> no se ofrece un slot que termine
    /// exactamente a medianoche. No es representable como <see cref="TimeOnly"/>,
    /// y el cálculo de capacidad —que construye <c>fecha + horaFin</c>— tomaría
    /// las 00:00 como un instante ANTERIOR al inicio y contaría mal. Con un
    /// horario 24x7 y visitas de dos horas, la última franja ofrecida es
    /// 20:00–22:00. Ofrecer instalaciones de 22:00 a medianoche no es un caso
    /// real de este negocio; perder un 500 sí lo era.</para>
    /// </remarks>
    public static IEnumerable<(TimeOnly Inicio, TimeOnly Fin)> Generate(
        int startHour, int endHour, int duracionMin, int bufferMin = 0)
    {
        if (duracionMin <= 0) yield break;

        var actual = startHour * 60;
        var cierre = Math.Min(endHour * 60, UltimoMinutoDelDia);

        while (actual < cierre)
        {
            var siguiente = actual + duracionMin;
            if (siguiente > cierre) break;

            yield return (AHora(actual), AHora(siguiente));
            actual = siguiente + Math.Max(0, bufferMin);
        }
    }

    private static TimeOnly AHora(int minutosDesdeMedianoche)
        => new(minutosDesdeMedianoche / 60, minutosDesdeMedianoche % 60);
}
