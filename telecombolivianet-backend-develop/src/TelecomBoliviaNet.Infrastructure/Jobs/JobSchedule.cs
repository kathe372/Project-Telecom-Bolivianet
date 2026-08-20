using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Domain.Entities.Admin;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.Infrastructure.Jobs;

/// <summary>
/// Reglas de agenda con catch-up para los jobs periódicos. Funciones puras y
/// testeables, sin acoplarse al <c>BackgroundService</c>.
///
/// El patrón que resuelven: un job atado a una ventana horaria estrecha
/// ("si son las 00:00 y el minuto está entre 1 y 10") se pierde la corrida
/// entera si el contenedor estaba reiniciando o desplegando en ese momento, y
/// nada la reintenta. Comparando contra la última clave de período ejecutada,
/// el job corre en el primer tick disponible después de la hora prevista.
/// </summary>
public static class JobSchedule
{
    /// <summary>Clave de día (yyyy-MM-dd) en la zona horaria que use el llamador.</summary>
    public static string DayKey(DateTime now) => now.ToString("yyyy-MM-dd");

    /// <summary>Clave de mes (yyyy-MM) en la zona horaria que use el llamador.</summary>
    public static string MonthKey(DateTime now) => now.ToString("yyyy-MM");

    /// <summary>
    /// ¿Toca ejecutar una tarea DIARIA? Cierto si ya pasó la hora prevista del día
    /// y la corrida de hoy sigue pendiente. <paramref name="now"/> y la hora
    /// objetivo deben estar en la misma zona horaria.
    /// </summary>
    public static bool ShouldRunDaily(DateTime now, string? lastRunDayKey, int hour, int minute = 0)
    {
        if (DayKey(now) == (lastRunDayKey ?? string.Empty)) return false;
        return now.TimeOfDay >= new TimeSpan(hour, minute, 0);
    }

    /// <summary>
    /// ¿Toca ejecutar una tarea MENSUAL? Cierto si ya llegó el día y la hora
    /// previstos del mes y la corrida de este mes sigue pendiente.
    ///
    /// A diferencia de la versión anterior (día == 1 &amp;&amp; hora == 0 &amp;&amp; minuto entre
    /// 1 y 10), si se pierde la ventana el trabajo se ejecuta igualmente en el
    /// siguiente tick: nunca queda un mes sin facturar por un despliegue.
    /// </summary>
    public static bool ShouldRunMonthly(
        DateTime now, string? lastRunMonthKey, int dayOfMonth, int hour, int minute = 0)
    {
        if (MonthKey(now) == (lastRunMonthKey ?? string.Empty)) return false;
        if (now.Day < dayOfMonth) return false;
        if (now.Day == dayOfMonth && now.TimeOfDay < new TimeSpan(hour, minute, 0)) return false;
        return true;
    }
}

/// <summary>
/// Persistencia de la última corrida de cada job en <c>SystemConfigs</c>.
/// Antes cada job redefinía sus propias funciones locales para leer y escribir
/// la misma clave.
/// </summary>
public static class JobRunTracker
{
    public static async Task<string?> ReadLastRunAsync(
        AppDbContext db, string key, CancellationToken ct = default)
        => await db.SystemConfigs
            .Where(c => c.Key == key)
            .Select(c => c.Value)
            .FirstOrDefaultAsync(ct);

    public static async Task MarkRanAsync(
        AppDbContext db, string key, string value, CancellationToken ct = default)
    {
        var cfg = await db.SystemConfigs.FirstOrDefaultAsync(c => c.Key == key, ct);
        if (cfg is null) db.SystemConfigs.Add(new SystemConfig { Key = key, Value = value });
        else             cfg.Value = value;
        await db.SaveChangesAsync(ct);
    }
}
