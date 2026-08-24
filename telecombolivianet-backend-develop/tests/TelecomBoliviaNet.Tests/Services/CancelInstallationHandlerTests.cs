using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using TelecomBoliviaNet.Application.Coverage.Services;
using TelecomBoliviaNet.Application.DTOs.Installations;
using TelecomBoliviaNet.Application.Installations.Commands;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Admin;
using TelecomBoliviaNet.Domain.Entities.Audit;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Tests.Helpers;
using Xunit;

namespace TelecomBoliviaNet.Tests.Services;

/// <summary>Tests TC-CANCEL-01 a TC-CANCEL-07 para CancelInstallationHandler (Fase 4).</summary>
public class CancelInstallationHandlerTests
{
    private static readonly Guid ActorId = Guid.NewGuid();

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static AuditService MakeAudit()
    {
        var repo = RepoMock.Empty<AuditLog>();
        return new AuditService(repo.Object, NullLogger<AuditService>.Instance);
    }

    private static Installation MakeInstallation(
        double hoursAhead  = 3,
        InstallationStatus status = InstallationStatus.Pendiente,
        SupportTicket?    ticket = null)
    {
        var fecha    = DateTime.UtcNow.AddHours(hoursAhead);
        var horaInicio = new TimeOnly(fecha.Hour, fecha.Minute);
        var inst = new Installation
        {
            Id         = Guid.NewGuid(),
            ClientId   = Guid.NewGuid(),
            PlanId     = Guid.NewGuid(),
            Fecha      = DateTime.SpecifyKind(fecha.Date, DateTimeKind.Utc),
            HoraInicio = horaInicio,
            Status     = status,
            Direccion  = "Av. Test 123",
        };
        if (ticket is not null)
        {
            inst.TicketId = ticket.Id;
            inst.Ticket   = ticket;
        }
        return inst;
    }

    private static IGenericRepository<SystemConfig> ConfigWithCancelHours(int? hours)
    {
        var m = new Mock<IGenericRepository<SystemConfig>>();
        m.Setup(r => r.FirstOrDefaultAsync(
                It.IsAny<System.Linq.Expressions.Expression<Func<SystemConfig, bool>>>()))
         .ReturnsAsync(hours is null ? null : new SystemConfig
         {
             Key   = SystemConfigKeys.InstallationCancelMinHours,
             Value = hours.Value.ToString(),
         });
        return m.Object;
    }

    private static CancelInstallationHandler MakeHandler(
        IInstallationRepository           instRepo,
        IGenericRepository<SupportTicket> ticketRepo,
        Mock<IBoxReservationService>?     boxReservation = null,
        int?                              cancelMinHours = null,
        Mock<IBotProxyService>?           botProxy       = null)
        => new(instRepo, ticketRepo, ConfigWithCancelHours(cancelMinHours), MakeAudit(),
               (boxReservation ?? new Mock<IBoxReservationService>()).Object,
               botProxy?.Object);

    private static CancelInstallationCommand Cmd(
        Guid instId,
        string canceladoPor = "CLIENTE",
        string motivo       = "Cambio de planes")
        => new(instId,
               new CancelInstallationDto { MotivoCancelacion = motivo, CanceladoPor = canceladoPor },
               ActorId, "Admin", "127.0.0.1");

    // ── TC-CANCEL-01: Cliente cancela FUERA de la ventana (26h) → éxito ─────
    [Fact]
    public async Task TC_CANCEL_01_ClientCancelsOutsideWindow_Succeeds()
    {
        var inst    = MakeInstallation(hoursAhead: 26);
        var handler = MakeHandler(SpecificRepoMock.Installations(inst).Object, RepoMock.Empty<SupportTicket>().Object);

        var result = await handler.Handle(Cmd(inst.Id, "CLIENTE"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        inst.Status.Should().Be(InstallationStatus.Cancelada);
        inst.CanceladoAt.Should().NotBeNull();
    }

    // ── TC-CANCEL-02: Cliente cancela DENTRO de la ventana (1h) → error ──────
    [Fact]
    public async Task TC_CANCEL_02_ClientCancelsInsideWindow_ReturnsFailure()
    {
        var inst    = MakeInstallation(hoursAhead: 1);
        var handler = MakeHandler(SpecificRepoMock.Installations(inst).Object, RepoMock.Empty<SupportTicket>().Object);

        var result = await handler.Handle(Cmd(inst.Id, "CLIENTE"), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("24 horas",
            "sin configuración la ventana comercial por defecto es 24 h");
    }

    // ── TC-CANCEL-03: Admin cancela con menos de 2h → permitido ─────────────
    [Fact]
    public async Task TC_CANCEL_03_AdminCancels1hAhead_Succeeds()
    {
        var inst    = MakeInstallation(hoursAhead: 1);
        var handler = MakeHandler(SpecificRepoMock.Installations(inst).Object, RepoMock.Empty<SupportTicket>().Object);

        var result = await handler.Handle(Cmd(inst.Id, "ADMIN"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        inst.Status.Should().Be(InstallationStatus.Cancelada);
    }

    // ── TC-CANCEL-04: Cancel instalación Completada → error ────────────────
    [Fact]
    public async Task TC_CANCEL_04_CompletedInstallation_ReturnsFailure()
    {
        var inst    = MakeInstallation(hoursAhead: 5, status: InstallationStatus.Completada);
        var handler = MakeHandler(SpecificRepoMock.Installations(inst).Object, RepoMock.Empty<SupportTicket>().Object);

        var result = await handler.Handle(Cmd(inst.Id, "ADMIN"), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().ContainAny("Completada", "completada");
    }

    // ── TC-CANCEL-05: Cancel instalación Reprogramada → permitido ──────────
    [Fact]
    public async Task TC_CANCEL_05_RescheduledInstallation_Succeeds()
    {
        var inst    = MakeInstallation(hoursAhead: 5, status: InstallationStatus.Reprogramada);
        var handler = MakeHandler(SpecificRepoMock.Installations(inst).Object, RepoMock.Empty<SupportTicket>().Object);

        var result = await handler.Handle(Cmd(inst.Id, "ADMIN"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        inst.Status.Should().Be(InstallationStatus.Cancelada);
    }

    // ── TC-CANCEL-06: CanceladoAt se establece al cancelar ───────────────────
    [Fact]
    public async Task TC_CANCEL_06_CanceladoAt_IsSetOnCancellation()
    {
        var before  = DateTime.UtcNow.AddSeconds(-1);
        var inst    = MakeInstallation(hoursAhead: 5);
        var handler = MakeHandler(SpecificRepoMock.Installations(inst).Object, RepoMock.Empty<SupportTicket>().Object);

        await handler.Handle(Cmd(inst.Id, "ADMIN"), CancellationToken.None);

        inst.CanceladoAt.Should().NotBeNull();
        inst.CanceladoAt!.Value.Should().BeAfter(before);
    }

    // ── TC-CANCEL-07: Ticket queda cerrado tras cancelación ──────────────────
    [Fact]
    public async Task TC_CANCEL_07_OpenTicket_IsClosedOnCancellation()
    {
        var ticket = new SupportTicket
        {
            Id          = Guid.NewGuid(),
            ClientId    = Guid.NewGuid(),
            Status      = TicketStatus.Abierto,
            Subject     = "Test Ticket",
            Description = "Test",
            CreatedAt   = DateTime.UtcNow,
        };
        var ticketRepo = RepoMock.Of(ticket);
        var inst       = MakeInstallation(hoursAhead: 5, ticket: ticket);
        var handler    = MakeHandler(SpecificRepoMock.Installations(inst).Object, ticketRepo.Object);

        await handler.Handle(Cmd(inst.Id, "ADMIN"), CancellationToken.None);

        ticketRepo.Verify(r => r.Update(
            It.Is<SupportTicket>(t => t.Status == TicketStatus.Cerrado)),
            Times.Once);
    }

    // ── TC-CANCEL-08: Instalación no encontrada → Failure ────────────────────
    [Fact]
    public async Task TC_CANCEL_08_InstallationNotFound_ReturnsFailure()
    {
        var handler = MakeHandler(
            SpecificRepoMock.Installations().Object,
            RepoMock.Empty<SupportTicket>().Object);

        var result = await handler.Handle(Cmd(Guid.NewGuid(), "ADMIN"), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("no encontrada");
    }

    // ── TC-CANCEL-09: Cancel instalación EnProceso → éxito ─────────────────
    [Fact]
    public async Task TC_CANCEL_09_InProcessInstallation_Succeeds()
    {
        var inst    = MakeInstallation(hoursAhead: 5, status: InstallationStatus.EnProceso);
        var handler = MakeHandler(SpecificRepoMock.Installations(inst).Object, RepoMock.Empty<SupportTicket>().Object);

        var result = await handler.Handle(Cmd(inst.Id, "ADMIN"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        inst.Status.Should().Be(InstallationStatus.Cancelada);
    }

    // ── TC-CANCEL-10: al cancelar se libera la reserva de puerto NAP (F3) ────
    [Fact]
    public async Task TC_CANCEL_10_Cancel_ReleasesBoxReservation()
    {
        var inst        = MakeInstallation(hoursAhead: 5);
        var reservation = new Mock<IBoxReservationService>();
        var handler     = MakeHandler(
            SpecificRepoMock.Installations(inst).Object, RepoMock.Empty<SupportTicket>().Object, reservation);

        var result = await handler.Handle(Cmd(inst.Id, "ADMIN"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        reservation.Verify(r => r.ReleaseAsync(inst, It.IsAny<CancellationToken>()), Times.Once);
    }

    // ── TC-CANCEL-11: ventana configurable — con 2h, cancelar a 3h → éxito ───
    [Fact]
    public async Task TC_CANCEL_11_ConfigurableWindow_2Hours_3hAheadSucceeds()
    {
        var inst    = MakeInstallation(hoursAhead: 3);
        var handler = MakeHandler(
            SpecificRepoMock.Installations(inst).Object, RepoMock.Empty<SupportTicket>().Object,
            cancelMinHours: 2);

        var result = await handler.Handle(Cmd(inst.Id, "CLIENTE"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
    }

    // ── TC-CANCEL-12: admin cancela → prospecto notificado por WhatsApp (F6) ─
    [Fact]
    public async Task TC_CANCEL_12_AdminCancel_NotifiesProspectViaWhatsApp()
    {
        var inst = MakeInstallation(hoursAhead: 5);
        inst.ClientId      = null;
        inst.ProspectName  = "Juan Prospecto";
        inst.ProspectPhone = "59171435981";

        var botProxy = new Mock<IBotProxyService>();
        var handler  = MakeHandler(
            SpecificRepoMock.Installations(inst).Object, RepoMock.Empty<SupportTicket>().Object,
            botProxy: botProxy);

        var result = await handler.Handle(Cmd(inst.Id, "ADMIN"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        botProxy.Verify(b => b.SendAdminMessageAsync(
            "59171435981", It.Is<string>(t => t.Contains("cancelada"))), Times.Once);
    }

    // ── TC-CANCEL-13: cliente cancela (no admin) → NO se auto-notifica ───────
    [Fact]
    public async Task TC_CANCEL_13_ClientCancel_DoesNotSelfNotify()
    {
        var inst     = MakeInstallation(hoursAhead: 26);
        var botProxy = new Mock<IBotProxyService>();
        var handler  = MakeHandler(
            SpecificRepoMock.Installations(inst).Object, RepoMock.Empty<SupportTicket>().Object,
            botProxy: botProxy);

        await handler.Handle(Cmd(inst.Id, "CLIENTE"), CancellationToken.None);

        botProxy.Verify(b => b.SendAdminMessageAsync(
            It.IsAny<string>(), It.IsAny<string>()), Times.Never);
    }
}
