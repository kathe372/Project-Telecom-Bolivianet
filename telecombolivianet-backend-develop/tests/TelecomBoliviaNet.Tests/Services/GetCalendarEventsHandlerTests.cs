using FluentAssertions;
using TelecomBoliviaNet.Application.Installations.Queries;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Primitives;
using TelecomBoliviaNet.Tests.Helpers;
using Xunit;

namespace TelecomBoliviaNet.Tests.Services;

/// <summary>
/// Tests TC-CAL-B01 a TC-CAL-B06 para GetCalendarEventsHandler (calendario, Fase 0).
/// Ver PLAN_CALENDARIO.md.
/// </summary>
public class GetCalendarEventsHandlerTests
{
    private static Installation MakeInst(
        string fechaIso,
        Guid?  tecnicoId = null,
        InstallationStatus status = InstallationStatus.Pendiente,
        int    duracionMin = 120,
        int    hora = 10,
        string prospectName = "Cliente Prueba")
        => new()
        {
            Id           = Guid.NewGuid(),
            Fecha        = DateTime.SpecifyKind(DateTime.Parse(fechaIso).Date, DateTimeKind.Utc),
            HoraInicio   = new TimeOnly(hora, 0),
            DuracionMin  = duracionMin,
            Status       = status,
            TecnicoId    = tecnicoId,
            ProspectName = prospectName,
            CreadoAt     = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
        };

    private static GetCalendarEventsHandler MakeHandler(params Installation[] items)
        => new(SpecificRepoMock.Installations(items).Object);

    // ── TC-CAL-B01: solo las del rango ───────────────────────────────────────
    [Fact]
    public async Task TC_CAL_B01_Rango_DevuelveSoloLasDelRango()
    {
        var handler = MakeHandler(
            MakeInst("2026-07-05"),   // dentro
            MakeInst("2026-07-31"),   // dentro (borde)
            MakeInst("2026-06-30"),   // fuera (antes)
            MakeInst("2026-08-01"));  // fuera (después)

        var res = await handler.Handle(
            new GetCalendarEventsQuery("2026-07-01", "2026-07-31"), CancellationToken.None);

        res.Should().HaveCount(2);
        res.Select(e => e.Fecha).Should().OnlyContain(f =>
            string.Compare(f, "2026-07-01") >= 0 && string.Compare(f, "2026-07-31") <= 0);
    }

    // ── TC-CAL-B02: filtro por técnico ───────────────────────────────────────
    [Fact]
    public async Task TC_CAL_B02_FiltroPorTecnico_SoloEseTecnico()
    {
        var tecnico = Guid.NewGuid();
        var otro    = Guid.NewGuid();
        var handler = MakeHandler(
            MakeInst("2026-07-10", tecnicoId: tecnico),
            MakeInst("2026-07-11", tecnicoId: otro),
            MakeInst("2026-07-12", tecnicoId: tecnico));

        var res = await handler.Handle(
            new GetCalendarEventsQuery("2026-07-01", "2026-07-31", tecnico), CancellationToken.None);

        res.Should().HaveCount(2);
        res.Should().OnlyContain(e => e.TecnicoId == tecnico);
    }

    // ── TC-CAL-B03: sin técnico → todos ──────────────────────────────────────
    [Fact]
    public async Task TC_CAL_B03_SinTecnico_DevuelveTodos()
    {
        var handler = MakeHandler(
            MakeInst("2026-07-10", tecnicoId: Guid.NewGuid()),
            MakeInst("2026-07-11", tecnicoId: Guid.NewGuid()),
            MakeInst("2026-07-12"));  // sin técnico

        var res = await handler.Handle(
            new GetCalendarEventsQuery("2026-07-01", "2026-07-31"), CancellationToken.None);

        res.Should().HaveCount(3);
    }

    // ── TC-CAL-B04: canceladas / no realizadas se incluyen con su estado ─────
    [Fact]
    public async Task TC_CAL_B04_IncluyeCanceladasYNoRealizadas()
    {
        var handler = MakeHandler(
            MakeInst("2026-07-10", status: InstallationStatus.Cancelada),
            MakeInst("2026-07-11", status: InstallationStatus.NoRealizada),
            MakeInst("2026-07-12", status: InstallationStatus.Completada));

        var res = await handler.Handle(
            new GetCalendarEventsQuery("2026-07-01", "2026-07-31"), CancellationToken.None);

        res.Should().HaveCount(3);
        res.Select(e => e.Status).Should().Contain(new[] { "Cancelada", "NoRealizada", "Completada" });
    }

    // ── TC-CAL-B05: fecha mal formada → DomainException (400 controlado) ──────
    [Theory]
    [InlineData("2026/07/01", "2026-07-31")]
    [InlineData("2026-07-01", "no-es-fecha")]
    [InlineData("", "2026-07-31")]
    public async Task TC_CAL_B05_FechaInvalida_LanzaDomainException(string desde, string hasta)
    {
        var handler = MakeHandler(MakeInst("2026-07-10"));

        var act = () => handler.Handle(
            new GetCalendarEventsQuery(desde, hasta), CancellationToken.None);

        await act.Should().ThrowAsync<DomainException>();
    }

    // ── TC-CAL-B06: campos del DTO poblados y en formato esperado ────────────
    [Fact]
    public async Task TC_CAL_B06_DtoConCamposDeCalendario()
    {
        var tecnico = Guid.NewGuid();
        var handler = MakeHandler(
            MakeInst("2026-07-15", tecnicoId: tecnico, duracionMin: 90, hora: 14,
                     status: InstallationStatus.EnProceso, prospectName: "Ana Rosales"));

        var res = await handler.Handle(
            new GetCalendarEventsQuery("2026-07-01", "2026-07-31"), CancellationToken.None);

        var e = res.Single();
        e.Fecha.Should().Be("2026-07-15");
        e.HoraInicio.Should().Be("14:00");
        e.DuracionMin.Should().Be(90);
        e.TecnicoId.Should().Be(tecnico);
        e.Status.Should().Be("EnProceso");
        e.ClienteNombre.Should().Be("Ana Rosales");
    }
}
