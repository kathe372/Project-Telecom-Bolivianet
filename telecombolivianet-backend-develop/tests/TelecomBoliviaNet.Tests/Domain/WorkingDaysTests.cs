using FluentAssertions;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Services;
using Xunit;

namespace TelecomBoliviaNet.Tests.Domain;

/// <summary>
/// La máscara de días laborables se decodificaba en cuatro sitios —la entidad,
/// las dos consultas de huecos y la pantalla de configuración— y ninguno tenía
/// tests (F5). Coincidían, pero nada obligaba a que siguieran coincidiendo.
/// </summary>
public class WorkingDaysTests
{
    // ── Cada bit corresponde al día que dice ────────────────────────────────

    [Theory]
    [InlineData(1,  DayOfWeek.Monday)]
    [InlineData(2,  DayOfWeek.Tuesday)]
    [InlineData(4,  DayOfWeek.Wednesday)]
    [InlineData(8,  DayOfWeek.Thursday)]
    [InlineData(16, DayOfWeek.Friday)]
    [InlineData(32, DayOfWeek.Saturday)]
    [InlineData(64, DayOfWeek.Sunday)]
    public void CadaBitEnciendeSuDia(int bit, DayOfWeek dia)
    {
        WorkingDays.Includes(bit, dia).Should().BeTrue();

        // …y solo el suyo.
        foreach (var otro in Enum.GetValues<DayOfWeek>().Where(d => d != dia))
            WorkingDays.Includes(bit, otro).Should().BeFalse(
                $"el bit {bit} es {dia}, no {otro}");
    }

    [Fact]
    public void LunesAViernes_EsLaMascaraPorDefecto()
    {
        WorkingDays.MondayToFriday.Should().Be(31);

        foreach (var laborable in new[]
        {
            DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday,
            DayOfWeek.Thursday, DayOfWeek.Friday,
        })
            WorkingDays.Includes(WorkingDays.MondayToFriday, laborable).Should().BeTrue();

        WorkingDays.Includes(WorkingDays.MondayToFriday, DayOfWeek.Saturday).Should().BeFalse();
        WorkingDays.Includes(WorkingDays.MondayToFriday, DayOfWeek.Sunday).Should().BeFalse();
    }

    [Fact]
    public void TodaLaSemana_IncluyeLosSieteDias()
    {
        WorkingDays.EveryDay.Should().Be(127);

        foreach (var dia in Enum.GetValues<DayOfWeek>())
            WorkingDays.Includes(WorkingDays.EveryDay, dia).Should().BeTrue();
    }

    [Fact]
    public void MascaraCero_NoIncluyeNingunDia()
    {
        foreach (var dia in Enum.GetValues<DayOfWeek>())
            WorkingDays.Includes(0, dia).Should().BeFalse();
    }

    // ── Nombres para mostrar ────────────────────────────────────────────────

    [Fact]
    public void LosNombresSalenDeLunesADomingo()
        => WorkingDays.Names(WorkingDays.EveryDay).Should().Equal(
            "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo");

    [Fact]
    public void SoloSeNombranLosDiasEncendidos()
        => WorkingDays.Names(1 | 32).Should().Equal("Lunes", "Sábado");

    [Fact]
    public void MascaraSinDias_NoNombraNinguno()
        => WorkingDays.Names(0).Should().BeEmpty();

    // ── Validación ──────────────────────────────────────────────────────────

    [Theory]
    [InlineData(0,   false)]   // un horario donde nunca se trabaja
    [InlineData(-1,  false)]
    [InlineData(128, false)]   // bit que no corresponde a ningún día
    [InlineData(1,   true)]
    [InlineData(31,  true)]
    [InlineData(127, true)]
    public void LaMascaraSeValidaEntreUnoYCientoVeintisiete(int mask, bool valida)
        => WorkingDays.IsValid(mask).Should().Be(valida);

    // ── La entidad y la regla no pueden divergir ────────────────────────────

    [Fact]
    public void LaEntidadDelegaEnLaMismaRegla()
    {
        // Es lo que protege al cálculo de SLA: usa BusinessSchedule.IsWorkingDay,
        // mientras que las consultas de huecos usan WorkingDays.Includes sobre la
        // máscara suelta. Si divergieran, el calendario ofrecería huecos en días
        // que el SLA considera cerrados.
        foreach (var mask in new[] { 0, 1, 31, 64, 127, 85 })
        {
            var schedule = new BusinessSchedule { WorkingDaysMask = mask };

            foreach (var dia in Enum.GetValues<DayOfWeek>())
                schedule.IsWorkingDay(dia).Should().Be(
                    WorkingDays.Includes(mask, dia),
                    $"máscara {mask}, día {dia}");
        }
    }
}
