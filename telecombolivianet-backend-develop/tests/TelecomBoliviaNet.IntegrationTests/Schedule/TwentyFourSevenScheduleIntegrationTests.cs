using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TelecomBoliviaNet.Application.DTOs.Tickets;
using TelecomBoliviaNet.Application.Installations.Queries;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Services;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.IntegrationTests.Schedule;

/// <summary>
/// D-21 de extremo a extremo: un horario 24x7 creado como lo crea la pantalla
/// tiene que dejar huecos en la agenda de instalaciones.
///
/// <para>Los tests de dominio comprueban que la entidad interpreta y normaliza
/// bien, pero eso no demuestra <b>el resultado que le importa al operador</b>: que
/// al marcar la casilla "24x7" el calendario siga ofreciendo citas. Ese era el
/// síntoma —agenda vacía todos los días, sin ningún error— y esto es lo único que
/// lo fija.</para>
/// </summary>
public class TwentyFourSevenScheduleIntegrationTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;
    public TwentyFourSevenScheduleIntegrationTests(CustomWebApplicationFactory factory)
        => _factory = factory;

    private async Task<IServiceScope> LimpiaHorariosAsync()
    {
        var scope = _factory.Services.CreateScope();
        var db    = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        await db.Database.ExecuteSqlRawAsync("""
            DELETE FROM "ScheduleHolidays";
            DELETE FROM "BusinessSchedules";
            DELETE FROM "UserSystems";
            """);

        // La consulta de huecos necesita al menos un técnico activo para tener capacidad.
        db.Set<UserSystem>().Add(new UserSystem
        {
            Id = Guid.NewGuid(), FullName = "Tecnico 24x7",
            Email = $"t247-{Guid.NewGuid():N}@test.bo", PasswordHash = "x",
            Role = UserRole.Tecnico, Status = UserStatus.Activo,
        });
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        return scope;
    }

    /// <summary>Lo que manda el formulario al marcar 24x7 y no tocar nada más.</summary>
    private static CreateBusinessScheduleDto Formulario24x7() => new(
        Name:            "Atención continua",
        TimeZoneName:    "America/La_Paz",
        UtcOffsetHours:  -4,
        WorkingDaysMask: 0,      // ← la pantalla no los pide al marcar 24x7
        StartHour:       0,      // ←
        EndHour:         0,      // ←
        Is24x7:          true,
        IsDefault:       true);

    [Fact]
    public async Task Un24x7_CreadoDesdeLaPantalla_DejaHuecosEnLaAgenda()
    {
        using var scope = await LimpiaHorariosAsync();

        var horarios = scope.ServiceProvider.GetRequiredService<IBusinessScheduleService>();
        var creado   = await horarios.CreateAsync(Formulario24x7());
        creado.IsSuccess.Should().BeTrue();

        var mediator = scope.ServiceProvider.GetRequiredService<IMediator>();
        var huecos   = await mediator.Send(new GetInstallationSlotsQuery(DiasAdelante: 7));

        huecos.Should().NotBeEmpty(
            "un horario 24x7 atiende todos los días: si la agenda sale vacía, es D-21");
        huecos.Select(h => h.Fecha).Distinct().Should().HaveCountGreaterThan(1,
            "no puede ofrecer huecos de un solo día");
    }

    [Fact]
    public async Task Un24x7_SeGuardaNormalizado_NoConLosCerosDelFormulario()
    {
        using var scope = await LimpiaHorariosAsync();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        await scope.ServiceProvider.GetRequiredService<IBusinessScheduleService>()
            .CreateAsync(Formulario24x7());

        var guardado = await db.Set<BusinessSchedule>().AsNoTracking()
            .FirstAsync(s => s.Is24x7);

        guardado.WorkingDaysMask.Should().Be(WorkingDays.EveryDay,
            "el dato guardado tiene que decir la verdad, no solo interpretarse bien");
        guardado.StartHour.Should().Be(0);
        guardado.EndHour.Should().Be(24);
    }

    [Fact]
    public async Task UnHorarioNormal_SoloDejaHuecosEnSusDias()
    {
        // Contraprueba: si el arreglo del 24x7 hubiera roto el caso normal
        // —abriendo todos los días— este test lo delata.
        using var scope = await LimpiaHorariosAsync();

        var creado = await scope.ServiceProvider.GetRequiredService<IBusinessScheduleService>()
            .CreateAsync(new CreateBusinessScheduleDto(
                Name: "Comercial", TimeZoneName: "America/La_Paz", UtcOffsetHours: -4,
                WorkingDaysMask: WorkingDays.MondayToFriday,
                StartHour: 8, EndHour: 18, Is24x7: false, IsDefault: true));
        creado.IsSuccess.Should().BeTrue();

        var huecos = await scope.ServiceProvider.GetRequiredService<IMediator>()
            .Send(new GetInstallationSlotsQuery(DiasAdelante: 14));

        huecos.Should().NotBeEmpty();
        huecos.Select(h => DateTime.Parse(h.Fecha).DayOfWeek).Distinct()
            .Should().NotContain(DayOfWeek.Sunday,
                "un horario de lunes a viernes no puede ofrecer citas en domingo");
    }

    [Fact]
    public async Task DesmarcarEl24x7_ExigeUnaMascaraValida_NoDejaElCalendarioMuerto()
    {
        using var scope = await LimpiaHorariosAsync();
        var horarios = scope.ServiceProvider.GetRequiredService<IBusinessScheduleService>();

        var creado = await horarios.CreateAsync(Formulario24x7());
        var id     = creado.Value!.Id;

        // El operador desmarca la casilla sin tocar días ni horas. Con la
        // normalización, lo que hay guardado ya es válido, así que la operación
        // procede y deja un horario de toda la semana en vez de uno muerto.
        var actualizado = await horarios.UpdateAsync(id, new UpdateBusinessScheduleDto(
            Name: null, TimeZoneName: null, UtcOffsetHours: null,
            WorkingDaysMask: null, StartHour: null, EndHour: null,
            Is24x7: false, IsActive: null, IsDefault: null));

        actualizado.IsSuccess.Should().BeTrue();

        var huecos = await scope.ServiceProvider.GetRequiredService<IMediator>()
            .Send(new GetInstallationSlotsQuery(DiasAdelante: 7));

        huecos.Should().NotBeEmpty(
            "antes de normalizar, desmarcar 24x7 dejaba máscara 0 y la agenda se vaciaba");
    }
}
