using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.IntegrationTests.Schedule;

/// <summary>
/// PASO 15 (2026-08-02): ScheduleRepository.GetActiveAsync() debe resolver el
/// BusinessSchedule marcado DEFAULT cuando hay más de uno activo — antes solo
/// exigía IsActive, así que resolvía "el primero por orden de inserción",
/// que podía no coincidir con el que ya usa el cálculo de SLA
/// (TicketHelper.GetDueDateFromSlaAsync, que sí exige IsDefault && IsActive).
/// </summary>
public class ScheduleRepositoryTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;
    public ScheduleRepositoryTests(CustomWebApplicationFactory factory) => _factory = factory;

    private async Task<IServiceScope> SeedAsync(Func<AppDbContext, Task> seed)
    {
        var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.ExecuteSqlRawAsync(
            "DELETE FROM \"ScheduleHolidays\"; DELETE FROM \"BusinessSchedules\";");
        await seed(db);
        await db.SaveChangesAsync();
        return scope;
    }

    private static BusinessSchedule NewSchedule(string name, bool isActive, bool isDefault) => new()
    {
        Id              = Guid.NewGuid(),
        Name            = name,
        TimeZoneName    = "America/La_Paz",
        UtcOffsetHours  = -4,
        WorkingDaysMask = 31,
        StartHour       = 8,
        EndHour         = 18,
        Is24x7          = false,
        IsActive        = isActive,
        IsDefault       = isDefault,
        CreatedAt       = DateTime.UtcNow,
    };

    [Fact]
    public async Task DosActivos_UnoDefault_DevuelveElDefault_NoElPrimeroPorInsercion()
    {
        using var scope = await SeedAsync(async db =>
        {
            // El default se inserta SEGUNDO a propósito — si el bug (solo
            // IsActive) siguiera presente, este test fallaría devolviendo el
            // primero (no-default) por orden de inserción.
            db.Set<BusinessSchedule>().Add(NewSchedule("No default", isActive: true, isDefault: false));
            db.Set<BusinessSchedule>().Add(NewSchedule("Default real", isActive: true, isDefault: true));
            await Task.CompletedTask;
        });

        var repo   = scope.ServiceProvider.GetRequiredService<IScheduleRepository>();
        var result = await repo.GetActiveAsync();

        result.Should().NotBeNull();
        result!.Name.Should().Be("Default real");
    }

    [Fact]
    public async Task UnSoloActivo_SinMarcarDefault_NoLoElige_QuedaAmbiguo()
    {
        // Caso de configuración incompleta: un único BusinessSchedule activo,
        // pero sin marcar IsDefault. El sistema NO debe "elegirlo de todos
        // modos" solo porque es el único — eso sería volver a adivinar en
        // silencio. Debe quedar null hasta que el admin lo marque explícito.
        using var scope = await SeedAsync(async db =>
        {
            db.Set<BusinessSchedule>().Add(NewSchedule("Único, sin marcar", isActive: true, isDefault: false));
            await Task.CompletedTask;
        });

        var repo   = scope.ServiceProvider.GetRequiredService<IScheduleRepository>();
        var result = await repo.GetActiveAsync();

        result.Should().BeNull();
    }

    [Fact]
    public async Task TresActivos_SinNingunoDefault_DevuelveNull_NoEligeCualquiera()
    {
        using var scope = await SeedAsync(async db =>
        {
            db.Set<BusinessSchedule>().Add(NewSchedule("A", isActive: true, isDefault: false));
            db.Set<BusinessSchedule>().Add(NewSchedule("B", isActive: true, isDefault: false));
            db.Set<BusinessSchedule>().Add(NewSchedule("C", isActive: true, isDefault: false));
            await Task.CompletedTask;
        });

        var repo   = scope.ServiceProvider.GetRequiredService<IScheduleRepository>();
        var result = await repo.GetActiveAsync();

        result.Should().BeNull("es un estado ambiguo — el admin debe marcar un default explícito, el sistema no debe adivinar");
    }

    [Fact]
    public async Task ScheduleInactivo_NuncaSeConsidera_AunqueSeaDefault()
    {
        using var scope = await SeedAsync(async db =>
        {
            db.Set<BusinessSchedule>().Add(NewSchedule("Inactivo pero default", isActive: false, isDefault: true));
            await Task.CompletedTask;
        });

        var repo   = scope.ServiceProvider.GetRequiredService<IScheduleRepository>();
        var result = await repo.GetActiveAsync();

        result.Should().BeNull();
    }

    [Fact]
    public async Task UnSoloActivoYDefault_CasoNormalDeHoy_SinCambioDeComportamiento()
    {
        using var scope = await SeedAsync(async db =>
        {
            db.Set<BusinessSchedule>().Add(NewSchedule("Horario Laboral", isActive: true, isDefault: true));
            await Task.CompletedTask;
        });

        var repo   = scope.ServiceProvider.GetRequiredService<IScheduleRepository>();
        var result = await repo.GetActiveAsync();

        result.Should().NotBeNull();
        result!.Name.Should().Be("Horario Laboral");
    }
}
