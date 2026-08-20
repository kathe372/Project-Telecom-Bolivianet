using FluentAssertions;
using TelecomBoliviaNet.Infrastructure.Jobs;
using Xunit;

namespace TelecomBoliviaNet.Tests.Services;

/// <summary>
/// REGRESIÓN (auditoría 2026-08-01): la generación mensual de facturas y los
/// recordatorios estaban atados a una ventana de 10 minutos
/// (<c>day == 1 &amp;&amp; hour == 0 &amp;&amp; min entre 1 y 10</c>). Si el contenedor estaba
/// desplegando o caído en ese intervalo, ese mes NO se facturaba a nadie y nada
/// lo reintentaba, porque la condición no vuelve a cumplirse hasta el mes
/// siguiente. Estos tests fijan el comportamiento de catch-up.
/// </summary>
public class JobScheduleTests
{
    private static DateTime At(int year, int month, int day, int hour = 0, int minute = 0)
        => new(year, month, day, hour, minute, 0, DateTimeKind.Utc);

    // ── ShouldRunMonthly ──────────────────────────────────────────────────────

    [Fact]
    public void Mensual_EnLaHoraPrevista_DebeEjecutar()
        => JobSchedule.ShouldRunMonthly(At(2026, 8, 1, 0, 5), lastRunMonthKey: "2026-07",
                                        dayOfMonth: 1, hour: 0)
            .Should().BeTrue();

    [Fact]
    public void Mensual_YaEjecutadoEsteMes_NoDebeRepetir()
        => JobSchedule.ShouldRunMonthly(At(2026, 8, 1, 0, 5), lastRunMonthKey: "2026-08",
                                        dayOfMonth: 1, hour: 0)
            .Should().BeFalse();

    [Fact]
    public void Mensual_AntesDeLaHora_NoDebeAdelantarse()
        => JobSchedule.ShouldRunMonthly(At(2026, 8, 7, 8, 59), lastRunMonthKey: "2026-07",
                                        dayOfMonth: 7, hour: 9)
            .Should().BeFalse();

    [Fact]
    public void Mensual_AntesDelDia_NoDebeAdelantarse()
        => JobSchedule.ShouldRunMonthly(At(2026, 8, 6, 23, 59), lastRunMonthKey: "2026-07",
                                        dayOfMonth: 7, hour: 9)
            .Should().BeFalse();

    [Theory]
    [InlineData(1, 0, 30)]   // el despliegue se comió la ventana por media hora
    [InlineData(1, 6, 0)]    // el contenedor volvió esa misma tarde
    [InlineData(3, 12, 0)]   // estuvo caído dos días
    [InlineData(28, 23, 0)]  // se detectó casi a fin de mes
    public void Mensual_SiSePerdioLaVentana_DebeEjecutarIgual(int day, int hour, int minute)
    {
        // Este es EXACTAMENTE el caso que antes dejaba un mes sin facturar.
        JobSchedule.ShouldRunMonthly(At(2026, 8, day, hour, minute),
                                     lastRunMonthKey: "2026-07",
                                     dayOfMonth: 1, hour: 0)
            .Should().BeTrue("un despliegue no puede dejar un mes sin facturar");
    }

    [Fact]
    public void Mensual_PrimeraEjecucionSinHistorial_DebeEjecutar()
        => JobSchedule.ShouldRunMonthly(At(2026, 8, 1, 0, 5), lastRunMonthKey: null,
                                        dayOfMonth: 1, hour: 0)
            .Should().BeTrue();

    [Fact]
    public void Mensual_TrasEjecutar_NoVuelveAEjecutarEnElMismoMes()
    {
        var now = At(2026, 8, 1, 0, 5);
        JobSchedule.ShouldRunMonthly(now, "2026-07", 1, 0).Should().BeTrue();

        // El job persiste la clave del mes y en el siguiente tick ya no repite.
        var marcado = JobSchedule.MonthKey(now);
        JobSchedule.ShouldRunMonthly(At(2026, 8, 1, 0, 6), marcado, 1, 0).Should().BeFalse();
        JobSchedule.ShouldRunMonthly(At(2026, 8, 20, 12, 0), marcado, 1, 0).Should().BeFalse();
    }

    // ── ShouldRunDaily ────────────────────────────────────────────────────────

    [Fact]
    public void Diario_EnLaHoraPrevista_DebeEjecutar()
        => JobSchedule.ShouldRunDaily(At(2026, 8, 1, 13, 30), lastRunDayKey: "2026-07-31",
                                      hour: 13, minute: 30)
            .Should().BeTrue();

    [Fact]
    public void Diario_AntesDeLaHora_NoDebeAdelantarse()
        => JobSchedule.ShouldRunDaily(At(2026, 8, 1, 13, 29), lastRunDayKey: "2026-07-31",
                                      hour: 13, minute: 30)
            .Should().BeFalse();

    [Fact]
    public void Diario_YaEjecutadoHoy_NoDebeRepetir()
        => JobSchedule.ShouldRunDaily(At(2026, 8, 1, 20, 0), lastRunDayKey: "2026-08-01",
                                      hour: 13, minute: 30)
            .Should().BeFalse();

    [Fact]
    public void Diario_DespliegueDespuesDeLaHora_DebeEjecutarIgual()
    {
        // Antes el job dormía hasta la hora y ejecutaba: si el contenedor arrancaba
        // más tarde, la corrida del día se perdía entera y no había reintento.
        JobSchedule.ShouldRunDaily(At(2026, 8, 1, 23, 45), lastRunDayKey: "2026-07-30",
                                   hour: 13, minute: 30)
            .Should().BeTrue();
    }

    [Fact]
    public void Diario_PrimeraEjecucionSinHistorial_DebeEjecutarTrasLaHora()
    {
        JobSchedule.ShouldRunDaily(At(2026, 8, 1, 14, 0), null, 13, 30).Should().BeTrue();
        JobSchedule.ShouldRunDaily(At(2026, 8, 1, 12, 0), null, 13, 30).Should().BeFalse();
    }

    // ── Claves de período ─────────────────────────────────────────────────────

    [Fact]
    public void DayKey_YMonthKey_UsanFormatoEstable()
    {
        JobSchedule.DayKey(At(2026, 8, 1, 5, 0)).Should().Be("2026-08-01");
        JobSchedule.MonthKey(At(2026, 8, 1, 5, 0)).Should().Be("2026-08");
    }
}
