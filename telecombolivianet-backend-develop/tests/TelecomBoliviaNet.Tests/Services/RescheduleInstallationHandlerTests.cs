using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using TelecomBoliviaNet.Application.DTOs.Installations;
using TelecomBoliviaNet.Application.Installations.Commands;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Audit;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Services;
using TelecomBoliviaNet.Tests.Helpers;
using Xunit;

namespace TelecomBoliviaNet.Tests.Services;

/// <summary>
/// Tests TC-REPROG-01 a TC-REPROG-07 para RescheduleInstallationHandler
/// (Fase 2 nivel comercial: fix B3 doble-reserva y B5 ticket desincronizado).
/// </summary>
public class RescheduleInstallationHandlerTests
{
    private static readonly Guid ActorId = Guid.NewGuid();

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static AuditService MakeAudit()
        => new(RepoMock.Empty<AuditLog>().Object, NullLogger<AuditService>.Instance);

    private static UserSystem MakeTecnico() => new()
    {
        Id = Guid.NewGuid(), FullName = "Técnico Test",
        Role = UserRole.Tecnico, Status = UserStatus.Activo,
    };

    private static Installation MakeInstallation(
        InstallationStatus status = InstallationStatus.Pendiente,
        SupportTicket?     ticket = null)
    {
        var inst = new Installation
        {
            Id             = Guid.NewGuid(),
            ClientId       = Guid.NewGuid(),
            PlanId         = Guid.NewGuid(),
            Plan           = new Plan
            {
                Id = Guid.NewGuid(), Name = "Plan Fibra", SpeedMb = 100,
                MonthlyPrice = 200, IsActive = true,
                TecnicosRequeridos = 1, DuracionInstalacionMin = 120,
            },
            Fecha          = DateTime.UtcNow.Date.AddDays(2),
            HoraInicio     = new TimeOnly(10, 0),
            DuracionMin    = 120,
            Direccion      = "Av. Test 123",
            Status         = status,
            ReminderSentAt = DateTime.UtcNow.AddHours(-1),
        };
        if (ticket is not null)
        {
            inst.TicketId = ticket.Id;
            inst.Ticket   = ticket;
        }
        return inst;
    }

    private static SupportTicket MakeTicket() => new()
    {
        Id      = Guid.NewGuid(),
        Subject = "[Instalación Nueva] NUEVO – Cliente nuevo – 2026-07-17 10:00",
        Type    = TicketType.InstalacionNueva,
        Status  = TicketStatus.Abierto,
        DueDate = DateTime.UtcNow.Date.AddDays(2).AddHours(12),
    };

    private static ISlotCalculatorService FixedCapacity(int count)
    {
        var m = new Mock<ISlotCalculatorService>();
        m.Setup(s => s.GetCommittedCapacityAsync(
                It.IsAny<DateOnly>(), It.IsAny<TimeOnly>(), It.IsAny<TimeOnly>(),
                It.IsAny<Guid?>(), It.IsAny<CancellationToken>()))
         .ReturnsAsync(count);
        return m.Object;
    }

    private static RescheduleInstallationHandler MakeHandler(
        Installation inst, int committedCapacity = 0, int pool = 1,
        IGenericRepository<TicketVisit>? visitRepo = null)
    {
        var tecnicos = Enumerable.Range(0, pool).Select(_ => MakeTecnico()).ToArray();
        return new RescheduleInstallationHandler(
            SpecificRepoMock.Installations(inst).Object,
            RepoMock.Empty<SupportTicket>().Object,
            visitRepo ?? RepoMock.Empty<TicketVisit>().Object,
            RepoMock.Of(tecnicos).Object,
            FixedCapacity(committedCapacity),
            MakeAudit(),
            // D-13: las tres escrituras van en una transacción.
            TestUow.Noop(),
            NullLogger<RescheduleInstallationHandler>.Instance);
    }

    private static RescheduleInstallationCommand Cmd(
        Guid instId, string fecha, string hora = "14:00")
        => new(instId,
               new RescheduleInstallationDto { Fecha = fecha, HoraInicio = hora },
               ActorId, "Admin", "127.0.0.1");

    private static string NuevaFecha => DateTime.UtcNow.Date.AddDays(5).ToString("yyyy-MM-dd");

    // ── TC-REPROG-01: vuelve a Pendiente, no Reprogramada (fix B3) ────────────
    [Fact]
    public async Task TC_REPROG_01_Status_ReturnsToPendiente()
    {
        var inst    = MakeInstallation();
        var handler = MakeHandler(inst);

        var result = await handler.Handle(Cmd(inst.Id, NuevaFecha), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        inst.Status.Should().Be(InstallationStatus.Pendiente,
            "Reprogramada quedaba invisible para el cálculo de capacidad (B3)");
    }

    // ── TC-REPROG-02: resetea ReminderSentAt → T-1 dispara para la nueva fecha ─
    [Fact]
    public async Task TC_REPROG_02_ReminderSentAt_IsReset()
    {
        var inst    = MakeInstallation();
        var handler = MakeHandler(inst);

        await handler.Handle(Cmd(inst.Id, NuevaFecha), CancellationToken.None);

        inst.ReminderSentAt.Should().BeNull();
    }

    // ── TC-REPROG-03: ticket sincronizado — DueDate y Subject nuevos (fix B5) ──
    [Fact]
    public async Task TC_REPROG_03_TicketDueDateAndSubject_Updated()
    {
        var ticket  = MakeTicket();
        var inst    = MakeInstallation(ticket: ticket);
        var handler = MakeHandler(inst);

        await handler.Handle(Cmd(inst.Id, NuevaFecha, "14:00"), CancellationToken.None);

        var esperado = DateTime.Parse(NuevaFecha).Date.AddHours(14).AddMinutes(inst.DuracionMin);
        ticket.DueDate.Should().Be(esperado, "el SLA debe medirse contra la nueva fecha");
        ticket.Subject.Should().Contain(NuevaFecha).And.Contain("14:00");
    }

    // ── TC-REPROG-04: sin capacidad en la nueva franja → error ────────────────
    [Fact]
    public async Task TC_REPROG_04_NoCapacity_ReturnsFailure()
    {
        var inst    = MakeInstallation();
        var handler = MakeHandler(inst, committedCapacity: 1, pool: 1);

        var result = await handler.Handle(Cmd(inst.Id, NuevaFecha), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("disponibilidad");
    }

    // ── TC-REPROG-05: completada/cancelada no se reprograma ───────────────────
    [Theory]
    [InlineData(InstallationStatus.Completada)]
    [InlineData(InstallationStatus.Cancelada)]
    public async Task TC_REPROG_05_TerminalStatus_ReturnsFailure(InstallationStatus status)
    {
        var inst    = MakeInstallation(status: status);
        var handler = MakeHandler(inst);

        var result = await handler.Handle(Cmd(inst.Id, NuevaFecha), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
    }

    // ── TC-REPROG-06: formato de fecha inválido → error ───────────────────────
    [Fact]
    public async Task TC_REPROG_06_InvalidDate_ReturnsFailure()
    {
        var inst    = MakeInstallation();
        var handler = MakeHandler(inst);

        var result = await handler.Handle(Cmd(inst.Id, "no-fecha"), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("fecha");
    }

    // ── TC-REPROG-07: una instalación ya Reprogramada puede reprogramarse ─────
    // (filas legadas sin normalizar siguen siendo operables)
    [Fact]
    public async Task TC_REPROG_07_LegacyReprogramada_CanBeRescheduledToPendiente()
    {
        var inst    = MakeInstallation(status: InstallationStatus.Reprogramada);
        var handler = MakeHandler(inst);

        var result = await handler.Handle(Cmd(inst.Id, NuevaFecha), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        inst.Status.Should().Be(InstallationStatus.Pendiente);
    }

    // ── TC-REPROG-09: la visita del ticket se mueve junto con la instalación ──
    // (2026-08-05: antes solo se sincronizaba el ticket, la TicketVisit creada
    // al agendar quedaba con la fecha/hora vieja en la tab "Visitas").
    [Fact]
    public async Task TC_REPROG_09_LinkedTicketVisit_ScheduledAtAndDuration_Updated()
    {
        var ticket = MakeTicket();
        var inst   = MakeInstallation(ticket: ticket);
        var visit  = new TicketVisit
        {
            Id          = Guid.NewGuid(),
            TicketId    = ticket.Id,
            ScheduledAt = inst.Fecha.Date.Add(inst.HoraInicio.ToTimeSpan()),
            DuracionMin = inst.DuracionMin,
            Status      = VisitStatus.Programada,
        };
        var visitRepo = RepoMock.Of(visit);
        var handler   = MakeHandler(inst, visitRepo: visitRepo.Object);

        await handler.Handle(Cmd(inst.Id, NuevaFecha, "14:00"), CancellationToken.None);

        var esperado = DateTime.SpecifyKind(DateTime.Parse(NuevaFecha).Date.AddHours(14), DateTimeKind.Utc);
        visit.ScheduledAt.Should().Be(esperado);
        visitRepo.Verify(r => r.Update(visit), Times.Once);
    }

    // ── TC-REPROG-10: visita ya Completada/Cancelada no se toca ───────────────
    [Fact]
    public async Task TC_REPROG_10_NonProgramadaVisit_NotTouched()
    {
        var ticket = MakeTicket();
        var inst   = MakeInstallation(ticket: ticket);
        var visitaOriginal = inst.Fecha.Date.Add(inst.HoraInicio.ToTimeSpan());
        var visit  = new TicketVisit
        {
            Id          = Guid.NewGuid(),
            TicketId    = ticket.Id,
            ScheduledAt = visitaOriginal,
            DuracionMin = inst.DuracionMin,
            Status      = VisitStatus.Completada,
        };
        var visitRepo = RepoMock.Of(visit);
        var handler   = MakeHandler(inst, visitRepo: visitRepo.Object);

        await handler.Handle(Cmd(inst.Id, NuevaFecha, "14:00"), CancellationToken.None);

        visit.ScheduledAt.Should().Be(visitaOriginal, "una visita ya completada/cancelada no debe reagendarse sola");
    }

    // ── TC-REPROG-08: resize del calendario (DuracionMin) actualiza la duración ─
    [Fact]
    public async Task TC_REPROG_08_DuracionMin_UpdatesDuration()
    {
        var inst    = MakeInstallation();           // DuracionMin = 120
        var handler = MakeHandler(inst);
        var cmd = new RescheduleInstallationCommand(inst.Id,
            new RescheduleInstallationDto { Fecha = NuevaFecha, HoraInicio = "14:00", DuracionMin = 180 },
            ActorId, "Admin", "127.0.0.1");

        var result = await handler.Handle(cmd, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        inst.DuracionMin.Should().Be(180);
    }
}
