using FluentAssertions;
using Moq;
using TelecomBoliviaNet.Application.Tickets.Queries;
using TelecomBoliviaNet.Domain.Entities.Admin;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Services;
using TelecomBoliviaNet.Tests.Helpers;
using Xunit;

// D-12 (2026-08-21): la ventana de estos tests pasó de 2 días a 7.
//
// Con 2 días dependían del DÍA DE LA SEMANA y de la HORA: el handler recorre de
// hoy a hoy+N y el horario de respaldo es L-V 8-18, así que un viernes por la
// tarde la ventana caía en fin de semana y no quedaba ni un slot que ofrecer.
// Los cinco pasaron a rojo al cruzar de jueves a viernes sin que nadie tocara
// ese código.
//
// Ninguno de estos tests trata sobre "2 días": comprueban SLA y capacidad, así
// que ampliar la ventana conserva su intención. El arreglo de fondo es inyectar
// el reloj en el handler, que hoy lee DateTime.UtcNow directamente.

namespace TelecomBoliviaNet.Tests.Services;

/// <summary>
/// PASO 16 Fase C: GetTicketVisitSlotsHandler — mismo cálculo de capacidad que
/// GetInstallationSlotsHandler (ver InstallationHandlerTests) pero con duración
/// configurable vía SystemConfig (los tickets no tienen Plan) y el flag WithinSla.
/// </summary>
public class GetTicketVisitSlotsHandlerTests
{
    private static readonly Guid TicketId = Guid.NewGuid();
    private static readonly Guid TecId    = Guid.NewGuid();

    private static UserSystem MakeTecnico() => new()
    {
        Id = TecId, FullName = "Carlos Tech", Email = "t@bo",
        Role = UserRole.Tecnico, Status = UserStatus.Activo,
    };

    private static SupportTicket MakeTicket(
        TicketStatus status = TicketStatus.Abierto, DateTime? slaDeadline = null) => new()
    {
        Id          = TicketId,
        Type        = TicketType.SoporteTecnico,
        Priority    = TicketPriority.Alta,
        Status      = status,
        Origin      = TicketOrigin.Bot,
        Subject     = "Sin conexión",
        Description = "Sin conexión",
        CreatedByUserId = Guid.NewGuid(),
        SlaDeadline = slaDeadline,
    };

    private static Mock<IGenericRepository<SystemConfig>> ConfigRepo(string? bufferMin = "0", string? visitDur = null)
    {
        var configs = new List<SystemConfig>();
        if (bufferMin is not null)
            configs.Add(new SystemConfig { Key = SystemConfigKeys.InstallationSlotBufferMinutes, Value = bufferMin });
        if (visitDur is not null)
            configs.Add(new SystemConfig { Key = SystemConfigKeys.TicketVisitDurationMinutes, Value = visitDur });

        var mock = new Mock<IGenericRepository<SystemConfig>>();
        mock.Setup(r => r.FirstOrDefaultAsync(It.IsAny<System.Linq.Expressions.Expression<Func<SystemConfig, bool>>>()))
            .ReturnsAsync((System.Linq.Expressions.Expression<Func<SystemConfig, bool>> pred) =>
                configs.AsQueryable().FirstOrDefault(pred));
        return mock;
    }

    private static Mock<ISlotCalculatorService> ZeroCapacity()
    {
        var m = new Mock<ISlotCalculatorService>();
        m.Setup(s => s.GetCommittedCapacityAsync(
                It.IsAny<DateOnly>(), It.IsAny<TimeOnly>(), It.IsAny<TimeOnly>(),
                It.IsAny<Guid?>(), It.IsAny<CancellationToken>()))
         .ReturnsAsync(0);
        return m;
    }

    // ── TC-TVS-01 · Ticket abierto, sin comprometidos → slots disponibles ──────

    [Fact]
    public async Task GetSlots_OpenTicket_NoCommitted_AllSlotsAvailable()
    {
        var ticketRepo = RepoMock.Of(MakeTicket());
        var userRepo   = RepoMock.Of(MakeTecnico());

        var scheduleRepo = new Mock<IScheduleRepository>();
        scheduleRepo.Setup(r => r.GetActiveAsync(It.IsAny<CancellationToken>()))
                    .ReturnsAsync((BusinessSchedule?)null); // fallback L-V 8-18

        var handler = new GetTicketVisitSlotsHandler(
            scheduleRepo.Object, ticketRepo.Object, userRepo.Object,
            ConfigRepo().Object, ZeroCapacity().Object);

        var result = await handler.Handle(new GetTicketVisitSlotsQuery(TicketId, 7), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().NotBeEmpty();
        result.Value!.Should().OnlyContain(s => s.Disponible);
    }

    // ── TC-TVS-02 · Ticket inexistente → Failure ────────────────────────────────

    [Fact]
    public async Task GetSlots_TicketNotFound_ReturnsFail()
    {
        var handler = new GetTicketVisitSlotsHandler(
            new Mock<IScheduleRepository>().Object,
            RepoMock.Empty<SupportTicket>().Object,
            RepoMock.Of(MakeTecnico()).Object,
            ConfigRepo().Object, ZeroCapacity().Object);

        var result = await handler.Handle(new GetTicketVisitSlotsQuery(Guid.NewGuid()), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
    }

    // ── TC-TVS-03 · Ticket cerrado → Failure ────────────────────────────────────

    [Fact]
    public async Task GetSlots_ClosedTicket_ReturnsFail()
    {
        var ticketRepo = RepoMock.Of(MakeTicket(status: TicketStatus.Cerrado));
        var handler = new GetTicketVisitSlotsHandler(
            new Mock<IScheduleRepository>().Object,
            ticketRepo.Object,
            RepoMock.Of(MakeTecnico()).Object,
            ConfigRepo().Object, ZeroCapacity().Object);

        var result = await handler.Handle(new GetTicketVisitSlotsQuery(TicketId), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
    }

    // ── TC-TVS-04 · Capacidad agotada → Disponible=false, Disponibles=0 ────────

    [Fact]
    public async Task GetSlots_CapacityExhausted_SlotsNotAvailable()
    {
        var ticketRepo = RepoMock.Of(MakeTicket());
        var userRepo   = RepoMock.Of(MakeTecnico()); // pool = 1

        var scheduleRepo = new Mock<IScheduleRepository>();
        scheduleRepo.Setup(r => r.GetActiveAsync(It.IsAny<CancellationToken>()))
                    .ReturnsAsync((BusinessSchedule?)null);

        var slotCalc = new Mock<ISlotCalculatorService>();
        slotCalc.Setup(s => s.GetCommittedCapacityAsync(
                It.IsAny<DateOnly>(), It.IsAny<TimeOnly>(), It.IsAny<TimeOnly>(),
                It.IsAny<Guid?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(1); // igual al pool → 0 disponibles

        var handler = new GetTicketVisitSlotsHandler(
            scheduleRepo.Object, ticketRepo.Object, userRepo.Object,
            ConfigRepo().Object, slotCalc.Object);

        var result = await handler.Handle(new GetTicketVisitSlotsQuery(TicketId, 7), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().NotBeEmpty();
        result.Value!.Should().OnlyContain(s => !s.Disponible && s.Disponibles == 0);
    }

    // ── TC-TVS-05 · SlaDeadline pasado → todos los slots WithinSla=false ───────

    [Fact]
    public async Task GetSlots_SlaDeadlineInPast_AllSlotsOutsideSla()
    {
        var ticketRepo = RepoMock.Of(MakeTicket(slaDeadline: DateTime.UtcNow.AddDays(-1)));
        var userRepo   = RepoMock.Of(MakeTecnico());

        var scheduleRepo = new Mock<IScheduleRepository>();
        scheduleRepo.Setup(r => r.GetActiveAsync(It.IsAny<CancellationToken>()))
                    .ReturnsAsync((BusinessSchedule?)null);

        var handler = new GetTicketVisitSlotsHandler(
            scheduleRepo.Object, ticketRepo.Object, userRepo.Object,
            ConfigRepo().Object, ZeroCapacity().Object);

        var result = await handler.Handle(new GetTicketVisitSlotsQuery(TicketId, 7), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().NotBeEmpty();
        result.Value!.Should().OnlyContain(s => !s.WithinSla);
    }

    // ── TC-TVS-06 · SlaDeadline lejano en el futuro → todos WithinSla=true ─────

    [Fact]
    public async Task GetSlots_SlaDeadlineFarInFuture_AllSlotsWithinSla()
    {
        var ticketRepo = RepoMock.Of(MakeTicket(slaDeadline: DateTime.UtcNow.AddDays(30)));
        var userRepo   = RepoMock.Of(MakeTecnico());

        var scheduleRepo = new Mock<IScheduleRepository>();
        scheduleRepo.Setup(r => r.GetActiveAsync(It.IsAny<CancellationToken>()))
                    .ReturnsAsync((BusinessSchedule?)null);

        var handler = new GetTicketVisitSlotsHandler(
            scheduleRepo.Object, ticketRepo.Object, userRepo.Object,
            ConfigRepo().Object, ZeroCapacity().Object);

        var result = await handler.Handle(new GetTicketVisitSlotsQuery(TicketId, 7), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Should().OnlyContain(s => s.WithinSla);
    }

    // ── TC-TVS-07 · Sin SlaDeadline → siempre WithinSla=true (no bloquea) ──────

    [Fact]
    public async Task GetSlots_NoSlaDeadline_AllSlotsWithinSla()
    {
        var ticketRepo = RepoMock.Of(MakeTicket(slaDeadline: null));
        var userRepo   = RepoMock.Of(MakeTecnico());

        var scheduleRepo = new Mock<IScheduleRepository>();
        scheduleRepo.Setup(r => r.GetActiveAsync(It.IsAny<CancellationToken>()))
                    .ReturnsAsync((BusinessSchedule?)null);

        var handler = new GetTicketVisitSlotsHandler(
            scheduleRepo.Object, ticketRepo.Object, userRepo.Object,
            ConfigRepo().Object, ZeroCapacity().Object);

        var result = await handler.Handle(new GetTicketVisitSlotsQuery(TicketId, 7), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Should().OnlyContain(s => s.WithinSla);
    }

    // ── TC-TVS-08 · Duración configurada en SystemConfig se respeta ────────────

    [Fact]
    public async Task GetSlots_ConfiguredVisitDuration_UsedInsteadOfDefault()
    {
        var ticketRepo = RepoMock.Of(MakeTicket());
        var userRepo   = RepoMock.Of(MakeTecnico());

        var scheduleRepo = new Mock<IScheduleRepository>();
        scheduleRepo.Setup(r => r.GetActiveAsync(It.IsAny<CancellationToken>()))
                    .ReturnsAsync((BusinessSchedule?)null); // 8-18, sin buffer

        // Duración 300 min con jornada 8-18 (600 min) → 2 slots por cada día completo
        // incluido (0 buffer). Ventana de 7 días para no depender de qué día de la
        // semana corre el test (el handler excluye fines de semana con el mask default).
        var handler = new GetTicketVisitSlotsHandler(
            scheduleRepo.Object, ticketRepo.Object, userRepo.Object,
            ConfigRepo(bufferMin: "0", visitDur: "300").Object, ZeroCapacity().Object);

        var result = await handler.Handle(new GetTicketVisitSlotsQuery(TicketId, 7), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().NotBeEmpty();
        // P1.3: el día de HOY puede tener menos de 2 slots si ya pasó la hora
        // del primero (comportamiento correcto, ver GetSlots_HorariosDeHoyYaPasados_NoSeOfrecen)
        // — la aserción de "2 slots por día completo" solo aplica a días futuros.
        var hoyStr = DateTime.UtcNow.ToString("yyyy-MM-dd");
        result.Value!.Where(s => s.Fecha != hoyStr)
            .GroupBy(s => s.Fecha).Should().OnlyContain(g => g.Count() == 2);
    }

    // ── TC-TVS-09 · Horarios de HOY que ya pasaron no se ofrecen (mismo bug que instalaciones) ──

    [Fact]
    public async Task GetSlots_HorariosDeHoyYaPasados_NoSeOfrecen()
    {
        var ticketRepo = RepoMock.Of(MakeTicket());
        var userRepo   = RepoMock.Of(MakeTecnico());

        var scheduleRepo = new Mock<IScheduleRepository>();
        scheduleRepo.Setup(r => r.GetActiveAsync(It.IsAny<CancellationToken>()))
                    .ReturnsAsync((BusinessSchedule?)null);

        var handler = new GetTicketVisitSlotsHandler(
            scheduleRepo.Object, ticketRepo.Object, userRepo.Object,
            ConfigRepo().Object, ZeroCapacity().Object);

        var result = await handler.Handle(new GetTicketVisitSlotsQuery(TicketId, 7), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        var ahoraBolivia = TimeZoneInfo.ConvertTimeFromUtc(
            DateTime.UtcNow,
            TimeZoneInfo.CreateCustomTimeZone("BOT", TimeSpan.FromHours(-4), "Bolivia Time", "BOT"));
        var hoyStr = ahoraBolivia.ToString("yyyy-MM-dd");

        // NotContain, no OnlyContain: la propiedad bajo prueba es "ningún horario de hoy empieza
        // antes de ahora", que se cumple igual cuando hoy no ofrece ninguno. Con OnlyContain la
        // prueba fallaba al ejecutarse fuera del horario laboral (colección vacía), es decir
        // dependía de la hora del día en que corriera la suite.
        result.Value!.Where(s => s.Fecha == hoyStr).Should().NotContain(
            s => TimeOnly.Parse(s.HoraInicio) <= TimeOnly.FromDateTime(ahoraBolivia),
            "ningún horario de hoy debería empezar antes de la hora actual (Bolivia, UTC-4)");
    }
}
