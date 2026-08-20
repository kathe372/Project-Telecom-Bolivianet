using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using TelecomBoliviaNet.Application.Clients.Commands;
using TelecomBoliviaNet.Application.DTOs.Clients;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Application.Services.Invoices;
using TelecomBoliviaNet.Domain.Entities.Audit;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Tests.Helpers;
using Xunit;

namespace TelecomBoliviaNet.Tests.Services;

/// <summary>
/// Tests TC-CONV-01 a TC-CONV-04 para la conversión prospecto→cliente
/// (Fase 4 nivel comercial: RegisterClientCommand con InstallationId).
/// </summary>
public class RegisterClientConversionTests
{
    private static readonly Guid PlanId  = Guid.NewGuid();
    private static readonly Guid ActorId = Guid.NewGuid();

    private static Plan MakePlan() => new()
    {
        Id = PlanId, Name = "Plan Fibra", SpeedMb = 100,
        MonthlyPrice = 200, IsActive = true,
    };

    private static Installation MakeProspectInstallation(
        Guid? clientId = null,
        decimal? gpsLat = -17.3895000m, decimal? gpsLng = -66.1568000m) => new()
    {
        Id            = Guid.NewGuid(),
        ClientId      = clientId,
        ProspectName  = "Juan Prospecto",
        ProspectPhone = "59171435981",
        PlanId        = PlanId,
        Fecha         = DateTime.UtcNow.Date,
        HoraInicio    = new TimeOnly(10, 0),
        Direccion     = "Av. Test 123",
        Status        = InstallationStatus.Completada,
        GpsLatitude   = gpsLat,
        GpsLongitude  = gpsLng,
    };

    private static AuditService MakeAudit()
        => new(RepoMock.Empty<AuditLog>().Object, NullLogger<AuditService>.Instance);

    private static RegisterClientHandler MakeHandler(
        IGenericRepository<Installation> instRepo,
        IGenericRepository<Client>?      clientRepo = null)
    {
        var clients  = clientRepo ?? RepoMock.Empty<Client>().Object;
        var invoices = RepoMock.Empty<Invoice>().Object;
        var billing  = new BillingService(
            clients, invoices, MakeAudit(),
            NullLogger<BillingService>.Instance,
            new Mock<IInvoiceNumberService>().Object,
            new Mock<INotifPublisher>().Object,
            new Mock<IUnitOfWork>().Object,
            new Mock<ICreditLedger>().Object);

        var tbn = new Mock<ITbnService>();
        tbn.Setup(t => t.GenerateNextAsync()).ReturnsAsync("TBN-100");

        return new RegisterClientHandler(
            clients, invoices,
            RepoMock.Empty<Payment>().Object,
            RepoMock.Empty<PaymentInvoice>().Object,
            RepoMock.Of<Plan>(MakePlan()).Object,
            instRepo,
            tbn.Object, MakeAudit(), billing,
            new Mock<IUnitOfWork>().Object,
            NullLogger<RegisterClientHandler>.Instance);
    }

    private static RegisterClientDto MakeDto(
        Guid? installationId, decimal? gpsLat = null, decimal? gpsLng = null) => new(
        FullName:          "Juan Prospecto",
        IdentityCard:      "7654321",
        PhoneMain:         "59171435981",
        PhoneSecondary:    null,
        Zone:              "Zona Test",
        Street:            "Av. Test 123",
        LocationRef:       null,
        GpsLatitude:       gpsLat,
        GpsLongitude:      gpsLng,
        WinboxNumber:      "WB-999",
        InstallationDate:  DateTime.UtcNow.Date,
        InstalledByUserId: ActorId,
        PlanId:            PlanId,
        HasTvCable:        false,
        OnuSerialNumber:   null,
        InstallationCost:  100,
        PaidInstallation:  false,
        PaidFirstMonth:    false,
        PaymentMethod:     null,
        Bank:              null,
        PhysicalReceiptNumber: null,
        InstallationId:    installationId);

    private static RegisterClientCommand Cmd(RegisterClientDto dto)
        => new(dto, ActorId, "Admin", "127.0.0.1");

    // ── TC-CONV-01: la instalación queda vinculada al cliente nuevo ──────────
    [Fact]
    public async Task TC_CONV_01_Installation_LinkedToNewClient()
    {
        var inst    = MakeProspectInstallation();
        var handler = MakeHandler(RepoMock.Of(inst).Object);

        var result = await handler.Handle(Cmd(MakeDto(inst.Id)), CancellationToken.None);

        result.IsSuccess.Should().BeTrue(result.ErrorMessage);
        inst.ClientId.Should().NotBeNull("la instalación debe apuntar al cliente registrado");
        inst.ClientId.Should().Be(result.Value!.Id);
    }

    // ── TC-CONV-02: sin GPS en el formulario → copia el GPS de la instalación ─
    [Fact]
    public async Task TC_CONV_02_NoFormGps_CopiesInstallationGps()
    {
        var inst = MakeProspectInstallation(gpsLat: -17.5m, gpsLng: -66.2m);

        Client? captured = null;
        var clientRepo = RepoMock.Empty<Client>();
        clientRepo.Setup(r => r.AddAsync(It.IsAny<Client>()))
            .Callback<Client>(c => captured = c)
            .Returns(Task.CompletedTask);

        var handler = MakeHandler(RepoMock.Of(inst).Object, clientRepo.Object);

        var result = await handler.Handle(
            Cmd(MakeDto(inst.Id, gpsLat: null, gpsLng: null)), CancellationToken.None);

        result.IsSuccess.Should().BeTrue(result.ErrorMessage);
        captured!.GpsLatitude.Should().Be(-17.5m);
        captured.GpsLongitude.Should().Be(-66.2m);
    }

    // ── TC-CONV-03: instalación ya vinculada a otro cliente → error ──────────
    [Fact]
    public async Task TC_CONV_03_InstallationAlreadyLinked_ReturnsFailure()
    {
        var inst    = MakeProspectInstallation(clientId: Guid.NewGuid());
        var handler = MakeHandler(RepoMock.Of(inst).Object);

        var result = await handler.Handle(Cmd(MakeDto(inst.Id)), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("vinculada");
    }

    // ── TC-CONV-04: sin InstallationId → registro normal, no toca instalaciones ─
    [Fact]
    public async Task TC_CONV_04_NoInstallationId_NormalRegistration()
    {
        var instRepo = RepoMock.Empty<Installation>();
        var handler  = MakeHandler(instRepo.Object);

        var result = await handler.Handle(Cmd(MakeDto(null)), CancellationToken.None);

        result.IsSuccess.Should().BeTrue(result.ErrorMessage);
        instRepo.Verify(r => r.UpdateAsync(It.IsAny<Installation>()), Times.Never);
    }
}
