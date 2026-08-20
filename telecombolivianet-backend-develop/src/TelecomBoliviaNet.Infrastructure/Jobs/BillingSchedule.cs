namespace TelecomBoliviaNet.Infrastructure.Jobs;

/// <summary>
/// Reglas de agenda del <see cref="BillingBackgroundJob"/>. Funciones puras y testeables,
/// separadas del job para poder verificarlas sin levantar el BackgroundService.
/// </summary>
public static class BillingSchedule
{
    /// <summary>Clave de día local (yyyy-MM-dd) usada para el marcado de vencidas.</summary>
    public static string DayKey(DateTime localNow) => localNow.ToString("yyyy-MM-dd");

    /// <summary>
    /// El marcado de facturas vencidas debe correr una vez por día. Si el servicio estuvo
    /// caído en el horario previsto, corre en el primer tick del día siguiente (catch-up),
    /// evitando que una factura vencida quede en "Pendiente" por haberse saltado la ventana.
    /// </summary>
    public static bool ShouldRunOverdue(DateTime localNow, string? lastRunDayKey)
        => DayKey(localNow) != (lastRunDayKey ?? string.Empty);
}
