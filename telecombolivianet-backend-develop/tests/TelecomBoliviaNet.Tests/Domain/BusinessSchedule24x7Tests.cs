using FluentAssertions;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Services;
using Xunit;

namespace TelecomBoliviaNet.Tests.Domain;

/// <summary>
/// Un horario 24x7 significa lo mismo mire quien lo mire.
///
/// <para>No lo significaba (F5). El cálculo de SLA trata el 24x7 aparte y nunca
/// consulta la máscara; las consultas de huecos sí la consultaban. Y el validador
/// de horarios <b>no comprueba nada cuando <c>Is24x7</c> es true</b>, así que un
/// horario creado marcando esa casilla y sin tocar los demás campos se guardaba
/// con máscara 0 y horas 0–0.</para>
///
/// <para>Resultado: el SLA seguía bien y el calendario de instalaciones se
/// quedaba sin un solo hueco, todos los días, sin ningún error a la vista.</para>
/// </summary>
public class BusinessSchedule24x7Tests
{
    /// <summary>Lo que se guarda al marcar 24x7 y dejar el resto del formulario vacío.</summary>
    private static BusinessSchedule Veinticuatro7SinConfigurar() => new()
    {
        Name            = "24/7",
        Is24x7          = true,
        WorkingDaysMask = 0,
        StartHour       = 0,
        EndHour         = 0,
    };

    [Fact]
    public void Un24x7_TrabajaTodosLosDias_AunqueLaMascaraEsteVacia()
    {
        var schedule = Veinticuatro7SinConfigurar();

        foreach (var dia in Enum.GetValues<DayOfWeek>())
            schedule.IsWorkingDay(dia).Should().BeTrue(
                $"{dia}: un horario 24x7 no cierra ningún día");
    }

    [Fact]
    public void Un24x7_CubreElDiaEntero_AunqueLasHorasEsten0()
    {
        Veinticuatro7SinConfigurar().OpenHours.Should().Be((0, 24));
    }

    [Fact]
    public void UnHorarioNormal_SigueRespetandoSuMascaraYSusHoras()
    {
        var schedule = new BusinessSchedule
        {
            Is24x7          = false,
            WorkingDaysMask = WorkingDays.MondayToFriday,
            StartHour       = 8,
            EndHour         = 18,
        };

        schedule.OpenHours.Should().Be((8, 18));
        schedule.IsWorkingDay(DayOfWeek.Monday).Should().BeTrue();
        schedule.IsWorkingDay(DayOfWeek.Sunday).Should().BeFalse();
    }

    [Fact]
    public void UnHorarioNormalConMascaraVacia_NoTrabajaNingunDia()
    {
        // Este caso el validador SÍ lo rechaza al crear (WorkingDays.IsValid),
        // así que no debería existir en base. El test fija que, si existiera, la
        // entidad no lo disfraza de 24x7.
        var schedule = new BusinessSchedule { Is24x7 = false, WorkingDaysMask = 0 };

        foreach (var dia in Enum.GetValues<DayOfWeek>())
            schedule.IsWorkingDay(dia).Should().BeFalse();
    }

    // ── El dato guardado también tiene que ser cierto ───────────────────────
    //
    // Que IsWorkingDay y OpenHours interpreten bien un 24x7 mal guardado evita el
    // síntoma, pero deja la mentira en la base. El día que alguien DESMARQUE la
    // casilla, esos ceros pasan a ser efectivos y el calendario vuelve a morir.

    [Fact]
    public void AlGuardar_Un24x7_SeNormalizaATodaLaSemanaYDiaCompleto()
    {
        var schedule = Veinticuatro7SinConfigurar();

        schedule.NormalizeSchedule();

        schedule.WorkingDaysMask.Should().Be(WorkingDays.EveryDay);
        schedule.StartHour.Should().Be(0);
        schedule.EndHour.Should().Be(24);
    }

    [Fact]
    public void DesmarcarEl24x7_DejaUnHorarioValido_NoUnoMuerto()
    {
        // Ésta es la razón de normalizar. Antes: 24x7 guardado con máscara 0, el
        // operador desmarca la casilla y se queda con un horario que no trabaja
        // ningún día — sin ningún error, solo una agenda vacía.
        var schedule = Veinticuatro7SinConfigurar();
        schedule.NormalizeSchedule();

        schedule.Is24x7 = false;

        WorkingDays.IsValid(schedule.WorkingDaysMask).Should().BeTrue();
        schedule.OpenHours.Should().Be((0, 24));
        foreach (var dia in Enum.GetValues<DayOfWeek>())
            schedule.IsWorkingDay(dia).Should().BeTrue();
    }

    [Fact]
    public void UnHorarioNormal_NoSeToca_AlNormalizar()
    {
        var schedule = new BusinessSchedule
        {
            Is24x7          = false,
            WorkingDaysMask = WorkingDays.MondayToFriday,
            StartHour       = 8,
            EndHour         = 18,
        };

        schedule.NormalizeSchedule();

        schedule.WorkingDaysMask.Should().Be(WorkingDays.MondayToFriday);
        schedule.OpenHours.Should().Be((8, 18));
    }
}
