using FluentAssertions;
using TelecomBoliviaNet.Domain.Services;
using Xunit;

namespace TelecomBoliviaNet.Tests.Domain;

/// <summary>
/// D-12 — Los casos que antes se esquivaban.
/// </summary>
/// <remarks>
/// Seis tests de huecos se pusieron rojos solos al cruzar la medianoche del
/// jueves al viernes, sin que nadie tocara el código: la ventana de dos días
/// caía en fin de semana y no quedaba nada que ofrecer. El arreglo de entonces
/// fue ampliar la ventana a siete días, que es esquivar el calendario, no
/// probarlo.
///
/// <para>Aquí "ahora" es un parámetro, así que el viernes por la tarde y el
/// feriado se prueban de frente en vez de evitarse.</para>
/// </remarks>
public class SlotWindowTests
{
    // 2026-08-28 es VIERNES. Sobre esa fecha se apoya toda la tabla.
    private static DateTime Viernes(int hora, int minuto = 0) => new(2026, 8, 28, hora, minuto, 0);

    private static readonly Func<DayOfWeek, bool> LunesAViernes =
        d => d is not (DayOfWeek.Saturday or DayOfWeek.Sunday);
    private static readonly Func<DateOnly, bool> SinFeriados = _ => false;

    [Fact]
    public void ViernesPorLaManana_ConVentanaDeDosDias_SoloOfreceElViernes()
    {
        // Ésta es la situación exacta que ponía roja media suite: sábado y
        // domingo no son laborables, así que el único día que queda es hoy.
        var dias = SlotWindow.DiasOfrecibles(
            Viernes(9), diasAdelante: 2, endHour: 18, LunesAViernes, SinFeriados).ToList();

        dias.Should().HaveCount(1);
        dias[0].DayOfWeek.Should().Be(DayOfWeek.Friday);
    }

    [Fact]
    public void ViernesDespuesDeCerrar_ConVentanaDeDosDias_NoOfreceNada()
    {
        // Y ésta es la que la ponía roja del todo: pasadas las 18:00 de un
        // viernes no queda ni hoy ni fin de semana. Cero huecos es la respuesta
        // CORRECTA, no un fallo.
        var dias = SlotWindow.DiasOfrecibles(
            Viernes(19), diasAdelante: 2, endHour: 18, LunesAViernes, SinFeriados).ToList();

        dias.Should().BeEmpty();
    }

    [Fact]
    public void ViernesJustoAlCerrar_TampocoOfreceHoy()
    {
        SlotWindow.DiasOfrecibles(Viernes(18), 0, 18, LunesAViernes, SinFeriados)
            .Should().BeEmpty("a las 18:00 en punto ya cerró");
        SlotWindow.DiasOfrecibles(Viernes(17, 59), 0, 18, LunesAViernes, SinFeriados)
            .Should().HaveCount(1, "a las 17:59 todavía no");
    }

    [Fact]
    public void ConVentanaDeSieteDias_ElFinDeSemanaSeSalta_PeroElLunesAparece()
    {
        var dias = SlotWindow.DiasOfrecibles(
            Viernes(9), diasAdelante: 7, endHour: 18, LunesAViernes, SinFeriados).ToList();

        dias.Select(d => d.DayOfWeek).Should().NotContain(
            [DayOfWeek.Saturday, DayOfWeek.Sunday]);
        dias.Select(d => d.DayOfWeek).Should().Contain(DayOfWeek.Monday);
    }

    [Fact]
    public void UnFeriadoNoSeOfrece_AunqueCaigaEnDiaLaborable()
    {
        var lunes = new DateOnly(2026, 8, 31);

        var dias = SlotWindow.DiasOfrecibles(
            Viernes(9), diasAdelante: 7, endHour: 18,
            LunesAViernes, fecha => fecha == lunes).ToList();

        dias.Should().NotContain(lunes);
        dias.Should().Contain(new DateOnly(2026, 9, 1), "el martes sigue en pie");
    }

    [Fact]
    public void UnHorario24x7_OfreceTambienElFinDeSemana()
    {
        var dias = SlotWindow.DiasOfrecibles(
            Viernes(9), diasAdelante: 3, endHour: 24, _ => true, SinFeriados).ToList();

        dias.Should().HaveCount(4);
        dias.Select(d => d.DayOfWeek).Should().Contain(
            [DayOfWeek.Saturday, DayOfWeek.Sunday]);
    }

    [Fact]
    public void VentanaCero_SoloMiraHoy()
    {
        SlotWindow.DiasOfrecibles(Viernes(9), 0, 18, LunesAViernes, SinFeriados)
            .Should().HaveCount(1);
    }

    // ── Las franjas de hoy que ya pasaron ──────────────────────────────────

    [Fact]
    public void UnaFranjaDeHoyQueYaEmpezo_NoSeOfrece()
    {
        var hoy = new DateOnly(2026, 8, 28);

        SlotWindow.YaPaso(hoy, new TimeOnly(9, 0), Viernes(14)).Should().BeTrue();
        SlotWindow.YaPaso(hoy, new TimeOnly(16, 0), Viernes(14)).Should().BeFalse();
    }

    [Fact]
    public void LaFranjaQueEmpiezaAhoraMismo_TampocoSeOfrece()
    {
        // Estricto a propósito: nadie llega a una visita que empieza en este
        // instante.
        SlotWindow.YaPaso(new DateOnly(2026, 8, 28), new TimeOnly(14, 0), Viernes(14))
            .Should().BeTrue();
    }

    [Fact]
    public void LasFranjasDeOtroDia_SeOfrecenTodas_AunqueSeanTempranas()
    {
        SlotWindow.YaPaso(new DateOnly(2026, 8, 31), new TimeOnly(8, 0), Viernes(23))
            .Should().BeFalse("mañana a las 8 no ha pasado por muy tarde que sea hoy");
    }
}
