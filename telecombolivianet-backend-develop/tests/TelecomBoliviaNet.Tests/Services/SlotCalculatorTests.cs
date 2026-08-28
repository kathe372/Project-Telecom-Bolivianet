using System.Linq.Expressions;
using FluentAssertions;
using Moq;
using TelecomBoliviaNet.Application.DTOs.Installations;
using TelecomBoliviaNet.Application.Installations.Queries;
using TelecomBoliviaNet.Domain.Entities.Admin;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Services;
using TelecomBoliviaNet.Tests.Helpers;
using Xunit;

namespace TelecomBoliviaNet.Tests.Services;

/// <summary>
/// Tests TC-SLOT-01 a TC-SLOT-08 para GetInstallationSlotsHandler refactorizado (Fase 2).
/// </summary>
public class SlotCalculatorTests
{
    // ── Helpers de setup ─────────────────────────────────────────────────────
    private static BusinessSchedule MakeSchedule(int mask = 31, int start = 8, int end = 18)
        => new() { WorkingDaysMask = mask, StartHour = start, EndHour = end, IsActive = true };

    private static GetInstallationSlotsHandler MakeHandler(
        BusinessSchedule?    schedule,
        Plan?                plan,
        int                  tecnicosPool,
        ISlotCalculatorService slotCalc,
        int                  bufferMin = 0)
    {
        var scheduleRepo = new Mock<IScheduleRepository>();
        scheduleRepo.Setup(r => r.GetActiveAsync(It.IsAny<CancellationToken>()))
                    .ReturnsAsync(schedule);

        var planRepo = new Mock<IGenericRepository<Plan>>();
        if (plan is not null)
            planRepo.Setup(r => r.GetByIdAsync(plan.Id)).ReturnsAsync(plan);

        var tecnicosArr = Enumerable.Range(0, tecnicosPool)
            .Select(_ => new UserSystem { Role = UserRole.Tecnico, Status = UserStatus.Activo })
            .ToArray();
        var userRepo = RepoMock.Of(tecnicosArr);

        return new GetInstallationSlotsHandler(
            scheduleRepo.Object, planRepo.Object, userRepo.Object,
            ConfigRepoWithBuffer(bufferMin), slotCalc);
    }

    private static IGenericRepository<SystemConfig> ConfigRepoWithBuffer(int minutes)
    {
        var m = new Mock<IGenericRepository<SystemConfig>>();
        m.Setup(r => r.FirstOrDefaultAsync(It.IsAny<Expression<Func<SystemConfig, bool>>>()))
         .ReturnsAsync(new SystemConfig
         {
             Key   = SystemConfigKeys.InstallationSlotBufferMinutes,
             Value = minutes.ToString(),
         });
        return m.Object;
    }

    private static ISlotCalculatorService ZeroCommitted() => FixedCommitted(0);

    private static ISlotCalculatorService FixedCommitted(int count)
    {
        var m = new Mock<ISlotCalculatorService>();
        m.Setup(s => s.GetCommittedCapacityAsync(
                It.IsAny<DateOnly>(), It.IsAny<TimeOnly>(), It.IsAny<TimeOnly>(),
                It.IsAny<Guid?>(), It.IsAny<CancellationToken>()))
         .ReturnsAsync(count);
        return m.Object;
    }

    // ── TC-SLOT-08: SlotTimeGenerator genera intervalos correctos ─────────────
    [Fact]
    public void TC_SLOT_08_SlotTimeGenerator_8to18_120min_Returns5Slots()
    {
        var slots = SlotTimeGenerator.Generate(startHour: 8, endHour: 18, duracionMin: 120).ToList();

        slots.Should().HaveCount(5);
        slots[0].Inicio.Should().Be(new TimeOnly(8,  0));
        slots[0].Fin.Should().Be(new TimeOnly(10, 0));
        slots[4].Inicio.Should().Be(new TimeOnly(16, 0));
        slots[4].Fin.Should().Be(new TimeOnly(18, 0));
    }

    // ── TC-SLOT-01: Domingo excluido (mask L-V=31) ────────────────────────────
    [Fact]
    public async Task TC_SLOT_01_Sunday_NotIncluded_WhenMask31()
    {
        // Construimos un handler con schedule L-V y sin comprometidos
        var handler  = MakeHandler(MakeSchedule(mask: 31), plan: null, tecnicosPool: 2, ZeroCommitted());
        var query    = new GetInstallationSlotsQuery(DiasAdelante: 7, PlanId: null);

        var slots = await handler.Handle(query, CancellationToken.None);

        // Ningún slot debe caer en domingo
        slots.Should().NotContain(s =>
            DateTime.Parse(s.Fecha).DayOfWeek == DayOfWeek.Sunday);
    }

    // ── TC-SLOT-02: Feriado excluido ──────────────────────────────────────────
    [Fact]
    public async Task TC_SLOT_02_Holiday_NotIncluded()
    {
        // El próximo lunes (o cualquier día laboral) marcado como feriado
        var manana      = DateTime.UtcNow.Date.AddDays(1);
        var mananaOnly  = DateOnly.FromDateTime(manana);

        var schedule = MakeSchedule(mask: 127); // todos los días
        schedule.Holidays.Add(new ScheduleHoliday
        {
            Id   = Guid.NewGuid(),
            Name = "Feriado Test",
            Date = mananaOnly,
            BusinessScheduleId = schedule.Id,
        });

        var handler = MakeHandler(schedule, null, 3, ZeroCommitted());
        var slots   = await handler.Handle(new GetInstallationSlotsQuery(7, null), CancellationToken.None);

        // No debe haber slots para el día feriado
        slots.Should().NotContain(s => s.Fecha == manana.ToString("yyyy-MM-dd"));
    }

    // ── TC-SLOT-03: Pool=2, comprometidos=2, plan necesita 1 → Disponible false
    [Fact]
    public async Task TC_SLOT_03_AllCommitted_SlotNotAvailable()
    {
        var handler = MakeHandler(MakeSchedule(mask: 127), null, 2, FixedCommitted(2));
        var slots   = await handler.Handle(new GetInstallationSlotsQuery(1, null), CancellationToken.None);

        slots.Should().OnlyContain(s => !s.Disponible);
        slots.Should().OnlyContain(s => s.Disponibles == 0);
    }

    // ── TC-SLOT-04: Pool=3, comprometidos=1, plan necesita 1 → Disponible true
    [Fact]
    public async Task TC_SLOT_04_OneCommitted_Pool3_SlotAvailable()
    {
        var handler = MakeHandler(MakeSchedule(mask: 127), null, 3, FixedCommitted(1));
        var slots   = await handler.Handle(new GetInstallationSlotsQuery(1, null), CancellationToken.None);

        slots.Should().OnlyContain(s => s.Disponible);
        slots.Should().OnlyContain(s => s.Disponibles == 2);
    }

    // ── TC-SLOT-05: Visita soporte descuenta del pool (ya cubierto por SlotCalc mock)
    [Fact]
    public async Task TC_SLOT_05_SupportVisitDeducted_ViaSlotCalculator()
    {
        // El SlotCalculatorService ya incluye visitas — aquí verificamos que
        // el handler consume el valor que devuelve el service
        var handler = MakeHandler(MakeSchedule(mask: 127), null, 4, FixedCommitted(2));
        var slots   = await handler.Handle(new GetInstallationSlotsQuery(1, null), CancellationToken.None);

        slots.Should().OnlyContain(s => s.Disponibles == 2); // 4 pool - 2 comprometidos
    }

    // ── TC-SLOT-06: Plan necesita 2, pool=2, comprometidos=1 → Disponible false
    [Fact]
    public async Task TC_SLOT_06_Plan2Techs_Pool2_1Committed_NotAvailable()
    {
        var plan = new Plan { Id = Guid.NewGuid(), TecnicosRequeridos = 2, DuracionInstalacionMin = 120, IsActive = true, Name = "Plan Fibra", SpeedMb = 100, MonthlyPrice = 200 };
        var handler = MakeHandler(MakeSchedule(mask: 127), plan, 2, FixedCommitted(1));
        var slots   = await handler.Handle(new GetInstallationSlotsQuery(1, plan.Id), CancellationToken.None);

        // pool=2, comprometidos=1 → disponibles=1, pero necesita 2 → Disponible false
        slots.Should().OnlyContain(s => !s.Disponible);
    }

    // ── TC-SLOT-07: Sin PlanId — usa TecnicosRequeridos=1 por defecto ─────────
    [Fact]
    public async Task TC_SLOT_07_NoPlanId_UsesDefaultThreshold1()
    {
        // pool=2, comprometidos=1 → 1 disponible ≥ 1 requerido → Disponible true
        var handler = MakeHandler(MakeSchedule(mask: 127), null, 2, FixedCommitted(1));
        var slots   = await handler.Handle(new GetInstallationSlotsQuery(1, null), CancellationToken.None);

        slots.Should().OnlyContain(s => s.Disponible);
    }

    // ── TC-SLOT-09: Sin schedule activo → fallback L-V / 8-18 ────────────────
    [Fact]
    public async Task TC_SLOT_09_NoActiveSchedule_FallbackWeekdaysOnly()
    {
        // schedule=null → handler usa fallback (L-V, 8-18, 120min)
        var handler = MakeHandler(null, null, 2, ZeroCommitted());
        var slots   = await handler.Handle(new GetInstallationSlotsQuery(7, null), CancellationToken.None);

        slots.Should().NotBeEmpty("el fallback debe generar slots para días L-V");
        slots.Should().NotContain(s =>
            DateTime.Parse(s.Fecha).DayOfWeek == DayOfWeek.Saturday ||
            DateTime.Parse(s.Fecha).DayOfWeek == DayOfWeek.Sunday,
            because: "el fallback es L-V solamente");
    }

    // ── TC-SLOT-10: SlotTimeGenerator con duracion 60 → 10 slots ─────────────
    [Fact]
    public void TC_SLOT_10_SlotTimeGenerator_8to18_60min_Returns10Slots()
    {
        var slots = SlotTimeGenerator.Generate(startHour: 8, endHour: 18, duracionMin: 60).ToList();

        slots.Should().HaveCount(10);
        slots[0].Inicio.Should().Be(new TimeOnly(8,  0));
        slots[9].Fin.Should().Be(new TimeOnly(18, 0));
    }

    // ── TC-SLOT-11: buffer de traslado separa los slots ──────────────────────
    [Fact]
    public void TC_SLOT_11_SlotTimeGenerator_ConBuffer_SeparaSlots()
    {
        var slots = SlotTimeGenerator
            .Generate(startHour: 8, endHour: 18, duracionMin: 120, bufferMin: 30)
            .ToList();

        // 8:00-10:00, 10:30-12:30, 13:00-15:00, 15:30-17:30 → el siguiente (18:00-20:00) no cabe
        slots.Should().HaveCount(4);
        slots[1].Inicio.Should().Be(new TimeOnly(10, 30),
            "el segundo slot debe iniciar 30 min después de terminar el primero");
        slots[3].Fin.Should().Be(new TimeOnly(17, 30));
    }

    // ── TC-SLOT-12: buffer 0 mantiene la grilla contigua clásica ─────────────
    [Fact]
    public void TC_SLOT_12_SlotTimeGenerator_SinBuffer_GrillaContigua()
    {
        var conBuffer0 = SlotTimeGenerator.Generate(8, 18, 120, 0).ToList();
        var clasica    = SlotTimeGenerator.Generate(8, 18, 120).ToList();

        conBuffer0.Should().BeEquivalentTo(clasica);
    }

    // ── D-21 · el generador y la medianoche ─────────────────────────────────

    [Fact]
    public void Cierre24_NoRevienta_YOfreceHuecosDesdeMedianoche()
    {
        // Antes: new TimeOnly(24, 0) lanzaba ArgumentOutOfRangeException y la
        // consulta de huecos devolvía un 500 con cualquier horario 24x7.
        var slots = SlotTimeGenerator.Generate(startHour: 0, endHour: 24, duracionMin: 120).ToList();

        slots.Should().NotBeEmpty();
        slots[0].Inicio.Should().Be(new TimeOnly(0, 0));
    }

    [Fact]
    public void Cierre24_NoOfreceUnSlotQueTermineAMedianoche()
    {
        // Límite asumido y documentado: TimeOnly llega a 23:59, y el cálculo de
        // capacidad tomaría un fin a las 00:00 como anterior al inicio.
        var slots = SlotTimeGenerator.Generate(startHour: 0, endHour: 24, duracionMin: 120).ToList();

        slots.Last().Fin.Should().Be(new TimeOnly(22, 0));
        slots.Should().OnlyContain(s => s.Fin > s.Inicio,
            "ningún slot puede cruzar la medianoche");
    }

    [Fact]
    public void NingunSlotDaLaVueltaAlReloj()
    {
        // AddMinutes sobre TimeOnly envuelve: un slot que se pasara de medianoche
        // volvía a las 00:xx y seguía pareciendo "antes del cierre".
        var slots = SlotTimeGenerator.Generate(startHour: 22, endHour: 24, duracionMin: 90).ToList();

        slots.Should().OnlyContain(s => s.Fin > s.Inicio);
    }

    [Fact]
    public void DuracionCeroONegativa_NoGeneraNada_NiSeCuelga()
    {
        SlotTimeGenerator.Generate(8, 18, duracionMin: 0).Should().BeEmpty();
        SlotTimeGenerator.Generate(8, 18, duracionMin: -30).Should().BeEmpty();
    }
}
