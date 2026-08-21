using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using TelecomBoliviaNet.Application.Coverage.Services;
using TelecomBoliviaNet.Application.DTOs.Installations;
using TelecomBoliviaNet.Application.Installations.Commands;
using TelecomBoliviaNet.Application.Installations.Queries;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Application.Services.Tickets;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Entities.Admin;
using TelecomBoliviaNet.Domain.Entities.Audit;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Coverage;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Services;
using TelecomBoliviaNet.Tests.Helpers;
using Xunit;

namespace TelecomBoliviaNet.Tests.Services;

/// <summary>
/// Tests unitarios para los handlers CQRS del módulo Instalaciones.
/// Cubre: GetInstallationSlotsHandler, CreateInstallationHandler,
///        CancelInstallationHandler, CompleteInstallationHandler,
///        AssignTechnicianHandler, RescheduleInstallationHandler.
/// </summary>
public class InstallationHandlerTests
{
    private static readonly Guid ClientId = Guid.NewGuid();
    private static readonly Guid PlanId   = Guid.NewGuid();
    private static readonly Guid TecId    = Guid.NewGuid();
    private static readonly Guid ActorId  = Guid.NewGuid();

    private static Plan MakePlan(bool active = true) =>
        new() { Id = PlanId, Name = "Plan Oro", MonthlyPrice = 200m, IsActive = active };

    private static Client MakeClient() =>
        TestEntityFactory.MakeClient(id: ClientId, tbnCode: "TBN-042",
            fullName: "Ana Pérez", phoneMain: "59170000099");

    private static UserSystem MakeTecnico(Guid? id = null) => new()
    {
        Id = id ?? TecId, FullName = "Carlos Tech", Email = "t@bo",
        Role = UserRole.Tecnico, Status = UserStatus.Activo,
    };

    private static Installation MakeInstallation(
        InstallationStatus status = InstallationStatus.Pendiente,
        SupportTicket?     ticket = null)
    {
        var inst = new Installation
        {
            Id         = Guid.NewGuid(),
            ClientId   = ClientId,
            PlanId     = PlanId,
            Fecha      = DateTime.UtcNow.Date.AddDays(2),
            HoraInicio = new TimeOnly(10, 0),
            DuracionMin = 120,
            Direccion  = "Calle Falsa 123",
            CreadoAt   = DateTime.UtcNow,
        };
        // Set status via reflection (same pattern as Client)
        typeof(Installation)
            .GetProperty(nameof(Installation.Status))!
            .SetValue(inst, status);
        if (ticket is not null) inst.Ticket = ticket;
        return inst;
    }

    private static AuditService MakeAudit() =>
        new(RepoMock.Empty<AuditLog>().Object, NullLogger<AuditService>.Instance);

    private static ISlotCalculatorService ZeroCapacity()
    {
        var m = new Mock<ISlotCalculatorService>();
        m.Setup(s => s.GetCommittedCapacityAsync(
                It.IsAny<DateOnly>(), It.IsAny<TimeOnly>(), It.IsAny<TimeOnly>(),
                It.IsAny<Guid?>(), It.IsAny<CancellationToken>()))
         .ReturnsAsync(0);
        return m.Object;
    }

    private static IBoxReservationService NoopReservation()
        => new Mock<IBoxReservationService>().Object;

    private static TicketNumberService MakeTicketNumSvc()
    {
        var seq = new Mock<ISequenceGenerator>();
        seq.Setup(s => s.NextTicketNumberAsync()).ReturnsAsync("TK-2026-0001");
        return new TicketNumberService(seq.Object);
    }

    // ── TC-INST-01 · Slots sin comprometidos → todos disponibles ─────────────────

    [Fact]
    public async Task GetSlots_NoActiveInstallations_AllSlotsAvailable()
    {
        var tecnico    = MakeTecnico();
        var userRepo   = RepoMock.Of(tecnico);

        var scheduleRepo = new Mock<IScheduleRepository>();
        scheduleRepo.Setup(r => r.GetActiveAsync(It.IsAny<CancellationToken>()))
                    .ReturnsAsync((BusinessSchedule?)null); // fallback L-V 8-18

        var slotCalc = new Mock<ISlotCalculatorService>();
        slotCalc.Setup(s => s.GetCommittedCapacityAsync(
                     It.IsAny<DateOnly>(), It.IsAny<TimeOnly>(), It.IsAny<TimeOnly>(),
                     It.IsAny<Guid?>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(0);

        var configRepo = new Mock<IGenericRepository<SystemConfig>>();
        configRepo.Setup(r => r.FirstOrDefaultAsync(
                It.IsAny<System.Linq.Expressions.Expression<Func<SystemConfig, bool>>>()))
            .ReturnsAsync(new SystemConfig
            {
                Key   = SystemConfigKeys.InstallationSlotBufferMinutes,
                Value = "0",
            });

        var planRepo = RepoMock.Empty<Plan>();
        var handler  = new GetInstallationSlotsHandler(
            scheduleRepo.Object, planRepo.Object, userRepo.Object,
            configRepo.Object, slotCalc.Object);

        // Ventana de 7 días (el valor por defecto), no de 2.
        //
        // Con 2 días el test dependía del DÍA DE LA SEMANA: el handler recorre de
        // hoy a hoy+N y el horario de respaldo es L-V, así que ejecutado un jueves
        // o un viernes la ventana caía en fin de semana y no había ni un slot que
        // ofrecer. Falló al cruzar la medianoche del 2026-08-20 al 21 sin que
        // nadie tocara ese código. Siete días siempre contienen un día laborable.
        //
        // El arreglo de fondo es inyectar el reloj en el handler, que hoy lee
        // DateTime.UtcNow directamente — anotado como D-12 en BUGS_DESCUBIERTOS.md.
        var slots = await handler.Handle(new GetInstallationSlotsQuery(7), CancellationToken.None);

        slots.Should().NotBeEmpty();
        slots.Should().OnlyContain(s => s.Disponible);
    }

    // ── TC-INST-01b · Slots de HOY que ya pasaron no se ofrecen ──────────────────
    // Bug reportado en producción: el corte de "hoy" solo miraba
    // DateTime.UtcNow.Hour >= endHour (18) para descartar el DÍA completo, sin
    // filtrar los slots individuales de hoy que ya pasaron (ej. ofrecer 08:00
    // estando ya en las 09:41) — y encima comparaba en UTC contra un horario
    // comercial en hora local de Bolivia (UTC-4).
    [Fact]
    public async Task GetSlots_HorariosDeHoyYaPasados_NoSeOfrecen()
    {
        var tecnico    = MakeTecnico();
        var userRepo   = RepoMock.Of(tecnico);

        var scheduleRepo = new Mock<IScheduleRepository>();
        scheduleRepo.Setup(r => r.GetActiveAsync(It.IsAny<CancellationToken>()))
                    .ReturnsAsync((BusinessSchedule?)null); // fallback L-V 8-18

        var slotCalc = ZeroCapacity();

        var configRepo = new Mock<IGenericRepository<SystemConfig>>();
        configRepo.Setup(r => r.FirstOrDefaultAsync(
                It.IsAny<System.Linq.Expressions.Expression<Func<SystemConfig, bool>>>()))
            .ReturnsAsync(new SystemConfig { Key = SystemConfigKeys.InstallationSlotBufferMinutes, Value = "0" });

        var planRepo = RepoMock.Empty<Plan>();
        var handler  = new GetInstallationSlotsHandler(
            scheduleRepo.Object, planRepo.Object, userRepo.Object,
            configRepo.Object, slotCalc);

        var slots = await handler.Handle(new GetInstallationSlotsQuery(2), CancellationToken.None);

        var ahoraBolivia = TimeZoneInfo.ConvertTimeFromUtc(
            DateTime.UtcNow,
            TimeZoneInfo.CreateCustomTimeZone("BOT", TimeSpan.FromHours(-4), "Bolivia Time", "BOT"));
        var hoyStr = ahoraBolivia.ToString("yyyy-MM-dd");

        // NotContain, no OnlyContain: la propiedad bajo prueba es "ningún horario de hoy empieza
        // antes de ahora", que se cumple igual cuando hoy no ofrece ninguno. Con OnlyContain la
        // prueba fallaba al ejecutarse fuera del horario laboral (colección vacía), es decir
        // dependía de la hora del día en que corriera la suite.
        var slotsDeHoy = slots.Where(s => s.Fecha == hoyStr).ToList();
        slotsDeHoy.Should().NotContain(
            s => TimeOnly.Parse(s.HoraInicio) <= TimeOnly.FromDateTime(ahoraBolivia),
            "ningún horario de hoy debería empezar antes de la hora actual (Bolivia, UTC-4)");
    }

    // ── TC-INST-02 · Create instalación válida → éxito + ticket creado ──────────

    [Fact]
    public async Task Crear_ValidDto_ReturnsSuccessAndCreatesTicket()
    {
        var instRepo   = RepoMock.Empty<Installation>();
        var clientRepo = RepoMock.Of(MakeClient());
        var planRepo   = RepoMock.Of<Plan>(MakePlan());
        var userRepo   = RepoMock.Of(MakeTecnico());
        var ticketRepo = RepoMock.Empty<SupportTicket>();
        var handler    = new CreateInstallationHandler(
            instRepo.Object, clientRepo.Object, planRepo.Object,
            userRepo.Object, ticketRepo.Object,
            RepoMock.Empty<TicketVisit>().Object, RepoMock.Empty<DistributionBox>().Object,
            MakeAudit(), ZeroCapacity(), NoopReservation(), MakeTicketNumSvc(),
            new TicketBalancingService(ticketRepo.Object, userRepo.Object));

        var dto = new CreateInstallationDto
        {
            ClienteId  = ClientId,
            PlanId     = PlanId,
            Fecha      = DateTime.UtcNow.AddDays(3).ToString("yyyy-MM-dd"),
            HoraInicio = "10:00",
            Direccion  = "Av. Principal 456",
        };

        var result = await handler.Handle(
            new CreateInstallationCommand(dto, ActorId, "Admin", "127.0.0.1"),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Status.Should().Be("Pendiente");
        ticketRepo.Verify(r => r.AddAsync(
            It.Is<SupportTicket>(t =>
                t.Type   == TicketType.InstalacionNueva &&
                t.Status == TicketStatus.Abierto)),
            Times.Once);
    }

    // ── TC-INST-03 · Create con cliente inexistente → Failure ───────────────────

    [Fact]
    public async Task Crear_ClientNotFound_ReturnsFail()
    {
        var handler = new CreateInstallationHandler(
            RepoMock.Empty<Installation>().Object,
            RepoMock.Empty<Client>().Object,
            RepoMock.Of<Plan>(MakePlan()).Object,
            RepoMock.Of(MakeTecnico()).Object,
            RepoMock.Empty<SupportTicket>().Object,
            RepoMock.Empty<TicketVisit>().Object,
            RepoMock.Empty<DistributionBox>().Object,
            MakeAudit(), ZeroCapacity(), NoopReservation(), MakeTicketNumSvc(),
            new TicketBalancingService(RepoMock.Empty<SupportTicket>().Object, RepoMock.Empty<UserSystem>().Object));

        var dto = new CreateInstallationDto
        {
            ClienteId  = Guid.NewGuid(),
            PlanId     = PlanId,
            Fecha      = DateTime.UtcNow.AddDays(3).ToString("yyyy-MM-dd"),
            HoraInicio = "10:00",
            Direccion  = "Test",
        };

        var result = await handler.Handle(
            new CreateInstallationCommand(dto, ActorId, "Admin", "127.0.0.1"),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("cliente");
    }

    // ── TC-INST-04 · Create con plan inactivo → Failure ─────────────────────────

    [Fact]
    public async Task Crear_InactivePlan_ReturnsFail()
    {
        var handler = new CreateInstallationHandler(
            RepoMock.Empty<Installation>().Object,
            RepoMock.Of(MakeClient()).Object,
            RepoMock.Of<Plan>(MakePlan(active: false)).Object,
            RepoMock.Of(MakeTecnico()).Object,
            RepoMock.Empty<SupportTicket>().Object,
            RepoMock.Empty<TicketVisit>().Object,
            RepoMock.Empty<DistributionBox>().Object,
            MakeAudit(), ZeroCapacity(), NoopReservation(), MakeTicketNumSvc(),
            new TicketBalancingService(RepoMock.Empty<SupportTicket>().Object, RepoMock.Empty<UserSystem>().Object));

        var dto = new CreateInstallationDto
        {
            ClienteId  = ClientId,
            PlanId     = PlanId,
            Fecha      = DateTime.UtcNow.AddDays(3).ToString("yyyy-MM-dd"),
            HoraInicio = "10:00",
            Direccion  = "Test",
        };

        var result = await handler.Handle(
            new CreateInstallationCommand(dto, ActorId, "Admin", "127.0.0.1"),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("plan");
    }

    // ── TC-INST-05 · Cancel instalación pendiente → OK + ticket cerrado ──────

    [Fact]
    public async Task Cancelar_PendingInstallation_ClosesTicket()
    {
        var ticket = new SupportTicket
        {
            Id = Guid.NewGuid(), ClientId = ClientId,
            Status = TicketStatus.Abierto, Subject = "Test",
            Description = "Test", CreatedAt = DateTime.UtcNow,
        };
        var inst       = MakeInstallation(ticket: ticket);
        var instRepo   = RepoMock.Of(inst);
        var ticketRepo = RepoMock.Of(ticket);
        var handler    = new CancelInstallationHandler(
            instRepo.Object, ticketRepo.Object,
            RepoMock.Empty<SystemConfig>().Object, MakeAudit(), NoopReservation());

        var result = await handler.Handle(
            new CancelInstallationCommand(
                inst.Id,
                new CancelInstallationDto { MotivoCancelacion = "Cambio de planes", CanceladoPor = "Admin" },
                ActorId, "Admin", "127.0.0.1"),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        instRepo.Verify(r => r.Update(
            It.Is<Installation>(i => i.Status == InstallationStatus.Cancelada)),
            Times.Once);
        ticketRepo.Verify(r => r.Update(
            It.Is<SupportTicket>(t => t.Status == TicketStatus.Cerrado)),
            Times.Once);
    }

    // ── TC-INST-06 · Cancel instalación ya completada → Failure ──────────────

    [Fact]
    public async Task Cancelar_CompletedInstallation_ReturnsFail()
    {
        var inst    = MakeInstallation(InstallationStatus.Completada);
        var handler = new CancelInstallationHandler(
            RepoMock.Of(inst).Object,
            RepoMock.Empty<SupportTicket>().Object,
            RepoMock.Empty<SystemConfig>().Object,
            MakeAudit(), NoopReservation());

        var result = await handler.Handle(
            new CancelInstallationCommand(
                inst.Id,
                new CancelInstallationDto { MotivoCancelacion = "Motivo", CanceladoPor = "Admin" },
                ActorId, "Admin", "127.0.0.1"),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
    }

    // ── TC-INST-07 · Complete → ticket pasa a Resuelto ────────────────────────

    [Fact]
    public async Task Completar_PendingInstallation_ResolvesTicket()
    {
        var ticket = new SupportTicket
        {
            Id = Guid.NewGuid(), ClientId = ClientId,
            Status = TicketStatus.Abierto, Subject = "Test",
            Description = "Test", CreatedAt = DateTime.UtcNow,
            DueDate = DateTime.UtcNow.AddHours(4),
        };
        var inst       = MakeInstallation(InstallationStatus.EnProceso, ticket);
        var instRepo   = RepoMock.Of(inst);
        var ticketRepo = RepoMock.Of(ticket);
        var handler    = new CompleteInstallationHandler(
            instRepo.Object, ticketRepo.Object,
            RepoMock.Empty<DistributionBox>().Object, MakeAudit(),
            new Mock<IUnitOfWork>().Object,
            NullLogger<CompleteInstallationHandler>.Instance);

        var result = await handler.Handle(
            new CompleteInstallationCommand(
                inst.Id,
                new CompleteInstallationDto { NotasTecnico = "Todo perfecto" },
                ActorId, "Admin", "127.0.0.1"),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        ticketRepo.Verify(r => r.Update(
            It.Is<SupportTicket>(t => t.Status == TicketStatus.Resuelto)),
            Times.Once);
    }

    // ── TC-INST-08 · Asignar técnico sin rol → Failure ─────────────────────────

    [Fact]
    public async Task AsignarTecnico_NonTecnicoRole_ReturnsFail()
    {
        var operador = new UserSystem
        {
            Id = Guid.NewGuid(), FullName = "Op", Email = "op@bo",
            Role = UserRole.Operador, Status = UserStatus.Activo,
        };
        var inst    = MakeInstallation();
        var handler = new AssignTechnicianHandler(
            RepoMock.Of(inst).Object,
            RepoMock.Of(operador).Object,
            MakeAudit());

        var result = await handler.Handle(
            new AssignTechnicianCommand(
                inst.Id,
                new AssignTechnicianDto { TecnicoId = operador.Id },
                ActorId, "Admin", "127.0.0.1"),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("Técnico");
    }
}
