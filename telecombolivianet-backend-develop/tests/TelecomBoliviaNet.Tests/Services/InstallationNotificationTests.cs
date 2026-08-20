using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using TelecomBoliviaNet.Application.DTOs.Installations;
using TelecomBoliviaNet.Application.Installations.Commands;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Audit;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Entities.Notifications;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Tests.Helpers;
using Xunit;

namespace TelecomBoliviaNet.Tests.Services;

/// <summary>Tests TC-NOTIF-01 a TC-NOTIF-08 para Fase 7 — notificaciones de instalación.</summary>
public class InstallationNotificationTests
{
    private static readonly Guid ActorId = Guid.NewGuid();

    private static AuditService MakeAudit()
    {
        var repo = RepoMock.Empty<AuditLog>();
        return new AuditService(repo.Object, NullLogger<AuditService>.Instance);
    }

    private static UserSystem MakeTecnico(string? phone = "59170000001")
        => new() { Id = Guid.NewGuid(), Role = UserRole.Tecnico, Status = UserStatus.Activo, FullName = "Juan Técnico", Phone = phone };

    private static Installation MakeInstallation() => new()
    {
        Id         = Guid.NewGuid(),
        ClientId   = Guid.NewGuid(),
        PlanId     = Guid.NewGuid(),
        Fecha      = DateTime.UtcNow.AddDays(2),
        HoraInicio = new TimeOnly(9, 0),
        Direccion  = "Av. Test 123",
        Status     = InstallationStatus.Pendiente,
    };

    private static AssignTechniciansHandler MakeHandler(
        IGenericRepository<Installation>           instRepo,
        IGenericRepository<InstallationTechnician> techRepo,
        IGenericRepository<UserSystem>             userRepo,
        INotifPublisher?                           notifPublisher = null)
    {
        var asignacion = new TechnicianAssignmentService(techRepo, userRepo, notifPublisher);
        return new(instRepo, asignacion, MakeAudit());
    }

    private static AssignTechniciansCommand Cmd(Guid instId, List<Guid> ids, Guid leadId)
        => new(instId, new AssignTechniciansDto { TecnicoIds = ids, TecnicoLeadId = leadId },
               ActorId, "Admin", "127.0.0.1");

    // ── TC-NOTIF-01: Notificación enviada a técnico con teléfono ────────────
    [Fact]
    public async Task TC_NOTIF_01_TecnicoWithPhone_NotificationPublished()
    {
        var tec       = MakeTecnico(phone: "59170000001");
        var inst      = MakeInstallation();
        var publisher = new Mock<INotifPublisher>();
        publisher.Setup(p => p.PublishAsync(It.IsAny<NotifType>(), It.IsAny<Guid>(),
            It.IsAny<string?>(), It.IsAny<Dictionary<string, string>>(), It.IsAny<Guid?>()))
            .Returns(Task.CompletedTask);

        var handler = MakeHandler(
            RepoMock.Of(inst).Object,
            RepoMock.Empty<InstallationTechnician>().Object,
            RepoMock.Of(tec).Object,
            publisher.Object);

        await handler.Handle(Cmd(inst.Id, [tec.Id], tec.Id), CancellationToken.None);

        publisher.Verify(p => p.PublishAsync(
            NotifType.INSTALACION_ASIGNADA,
            It.IsAny<Guid>(),
            "59170000001",
            It.IsAny<Dictionary<string, string>>(),
            inst.Id), Times.Once);
    }

    // ── TC-NOTIF-02: Técnico sin teléfono → no se publica notificación ──────
    [Fact]
    public async Task TC_NOTIF_02_TecnicoWithoutPhone_NoNotification()
    {
        var tec       = MakeTecnico(phone: null);
        var inst      = MakeInstallation();
        var publisher = new Mock<INotifPublisher>();

        var handler = MakeHandler(
            RepoMock.Of(inst).Object,
            RepoMock.Empty<InstallationTechnician>().Object,
            RepoMock.Of(tec).Object,
            publisher.Object);

        await handler.Handle(Cmd(inst.Id, [tec.Id], tec.Id), CancellationToken.None);

        publisher.Verify(p => p.PublishAsync(
            It.IsAny<NotifType>(), It.IsAny<Guid>(), It.IsAny<string?>(),
            It.IsAny<Dictionary<string, string>>(), It.IsAny<Guid?>()), Times.Never);
    }

    // ── TC-NOTIF-03: Sin publisher inyectado → handler no falla ─────────────
    [Fact]
    public async Task TC_NOTIF_03_NullPublisher_HandlerSucceeds()
    {
        var tec  = MakeTecnico();
        var inst = MakeInstallation();

        var handler = MakeHandler(
            RepoMock.Of(inst).Object,
            RepoMock.Empty<InstallationTechnician>().Object,
            RepoMock.Of(tec).Object,
            notifPublisher: null);

        var result = await handler.Handle(Cmd(inst.Id, [tec.Id], tec.Id), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
    }

    // ── TC-NOTIF-04: 2 técnicos → 2 publicaciones ───────────────────────────
    [Fact]
    public async Task TC_NOTIF_04_TwoTechnicians_TwoNotifications()
    {
        var tec1 = new UserSystem { Id = Guid.NewGuid(), Role = UserRole.Tecnico, Status = UserStatus.Activo, FullName = "Tec1", Phone = "59170000001" };
        var tec2 = new UserSystem { Id = Guid.NewGuid(), Role = UserRole.Tecnico, Status = UserStatus.Activo, FullName = "Tec2", Phone = "59170000002" };
        var inst = MakeInstallation();

        var publisher = new Mock<INotifPublisher>();
        publisher.Setup(p => p.PublishAsync(It.IsAny<NotifType>(), It.IsAny<Guid>(),
            It.IsAny<string?>(), It.IsAny<Dictionary<string, string>>(), It.IsAny<Guid?>()))
            .Returns(Task.CompletedTask);

        var handler = MakeHandler(
            RepoMock.Of(inst).Object,
            RepoMock.Empty<InstallationTechnician>().Object,
            RepoMock.Of(tec1, tec2).Object,
            publisher.Object);

        await handler.Handle(Cmd(inst.Id, [tec1.Id, tec2.Id], tec1.Id), CancellationToken.None);

        publisher.Verify(p => p.PublishAsync(
            NotifType.INSTALACION_ASIGNADA, It.IsAny<Guid>(), It.IsAny<string?>(),
            It.IsAny<Dictionary<string, string>>(), It.IsAny<Guid?>()), Times.Exactly(2));
    }

    // ── TC-NOTIF-05: Contexto contiene nombre del técnico ──────────────────
    [Fact]
    public async Task TC_NOTIF_05_NotificationContext_ContainsTecnicoName()
    {
        var tec      = MakeTecnico(phone: "59170000099");
        tec.FullName = "María Técnico";
        var inst     = MakeInstallation();

        Dictionary<string, string>? capturedContext = null;
        var publisher = new Mock<INotifPublisher>();
        publisher.Setup(p => p.PublishAsync(It.IsAny<NotifType>(), It.IsAny<Guid>(),
            It.IsAny<string?>(), It.IsAny<Dictionary<string, string>>(), It.IsAny<Guid?>()))
            .Callback<NotifType, Guid, string?, Dictionary<string, string>, Guid?>(
                (_, _, _, ctx, _) => capturedContext = ctx)
            .Returns(Task.CompletedTask);

        var handler = MakeHandler(
            RepoMock.Of(inst).Object,
            RepoMock.Empty<InstallationTechnician>().Object,
            RepoMock.Of(tec).Object,
            publisher.Object);

        await handler.Handle(Cmd(inst.Id, [tec.Id], tec.Id), CancellationToken.None);

        capturedContext.Should().NotBeNull();
        capturedContext!["tecnico"].Should().Be("María Técnico");
    }

    // ── TC-NOTIF-06: RECORDATORIO_INSTALACION existe en NotifType ───────────
    [Fact]
    public void TC_NOTIF_06_RecordatorioInstalacion_ExistsInEnum()
    {
        var values = Enum.GetValues<NotifType>();
        values.Should().Contain(NotifType.RECORDATORIO_INSTALACION);
    }

    // ── TC-NOTIF-07: INSTALACION_ASIGNADA existe en NotifType ───────────────
    [Fact]
    public void TC_NOTIF_07_InstalacionAsignada_ExistsInEnum()
    {
        var values = Enum.GetValues<NotifType>();
        values.Should().Contain(NotifType.INSTALACION_ASIGNADA);
    }

    // ── TC-NOTIF-08: ClientId de instalación se pasa al publisher ───────────
    [Fact]
    public async Task TC_NOTIF_08_InstallationClientId_PassedToPublisher()
    {
        var tec      = MakeTecnico(phone: "59170000001");
        var inst     = MakeInstallation();
        var expected = inst.ClientId!.Value;

        Guid capturedClienteId = Guid.NewGuid();
        var publisher = new Mock<INotifPublisher>();
        publisher.Setup(p => p.PublishAsync(It.IsAny<NotifType>(), It.IsAny<Guid>(),
            It.IsAny<string?>(), It.IsAny<Dictionary<string, string>>(), It.IsAny<Guid?>()))
            .Callback<NotifType, Guid, string?, Dictionary<string, string>, Guid?>(
                (_, clientId, _, _, _) => capturedClienteId = clientId)
            .Returns(Task.CompletedTask);

        var handler = MakeHandler(
            RepoMock.Of(inst).Object,
            RepoMock.Empty<InstallationTechnician>().Object,
            RepoMock.Of(tec).Object,
            publisher.Object);

        await handler.Handle(Cmd(inst.Id, [tec.Id], tec.Id), CancellationToken.None);

        capturedClienteId.Should().Be(expected);
    }
}
