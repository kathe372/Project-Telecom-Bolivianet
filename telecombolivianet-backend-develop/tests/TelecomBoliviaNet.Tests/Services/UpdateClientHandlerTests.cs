using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using TelecomBoliviaNet.Application.Clients.Commands;
using TelecomBoliviaNet.Application.DTOs.Clients;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Audit;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Tests.Helpers;
using Xunit;

namespace TelecomBoliviaNet.Tests.Services;

/// <summary>
/// 2026-08-05: al editar un cliente, si cambia PhoneMain/PhoneSecondary se le
/// avisa al chatbot (IBotOutboundProxy.InvalidateIdentityAsync) para que la
/// sesión de WhatsApp de esos números se re-verifique de inmediato en vez de
/// esperar hasta el chequeo periódico (hasta 2h) — ver ClientIdentificationHandler.
/// </summary>
public class UpdateClientHandlerTests
{
    private static readonly Guid ActorId = Guid.NewGuid();

    private static AuditService MakeAudit()
        => new(RepoMock.Empty<AuditLog>().Object, NullLogger<AuditService>.Instance);

    private static Plan MakePlan(Guid id) => new()
    {
        Id = id, Name = "Plan Fibra", SpeedMb = 100, MonthlyPrice = 200, IsActive = true,
    };

    private static UpdateClientDto MakeDto(Client client, Guid planId, string? phoneMain = null, string? phoneSecondary = null)
        => new(
            FullName:        client.FullName,
            IdentityCard:    client.IdentityCard,
            PhoneMain:       phoneMain ?? client.PhoneMain,
            PhoneSecondary:  phoneSecondary,
            Zone:            client.Zone,
            Street:          null,
            LocationRef:     null,
            GpsLatitude:     null,
            GpsLongitude:    null,
            WinboxNumber:    client.WinboxNumber,
            PlanId:          planId,
            HasTvCable:      false,
            OnuSerialNumber: null);

    private static (UpdateClientHandler Handler, Mock<IBotOutboundProxy> BotProxy) MakeHandler(Client client, Plan plan)
    {
        var botProxy = new Mock<IBotOutboundProxy>();
        botProxy.Setup(b => b.InvalidateIdentityAsync(It.IsAny<string>())).ReturnsAsync(true);

        var handler = new UpdateClientHandler(
            SpecificRepoMock.Clients(client).Object,
            RepoMock.Of(plan).Object,
            MakeAudit(),
            botProxy.Object);

        return (handler, botProxy);
    }

    [Fact]
    public async Task PhoneMainCambia_AvisaAlChatbotConElTelefonoViejoYElNuevo()
    {
        var client = TestEntityFactory.MakeClient(phoneMain: "70000001");
        var plan   = MakePlan(client.PlanId);
        var (handler, botProxy) = MakeHandler(client, plan);

        var result = await handler.Handle(
            new UpdateClientCommand(client.Id, MakeDto(client, plan.Id, phoneMain: "70000002"), ActorId, "Admin", "127.0.0.1"),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        botProxy.Verify(b => b.InvalidateIdentityAsync("70000001"), Times.Once);
        botProxy.Verify(b => b.InvalidateIdentityAsync("70000002"), Times.Once);
        botProxy.Verify(b => b.InvalidateIdentityAsync(It.IsAny<string>()), Times.Exactly(2));
    }

    [Fact]
    public async Task TelefonoNoCambia_NoAvisaAlChatbot()
    {
        var client = TestEntityFactory.MakeClient(phoneMain: "70000001");
        var plan   = MakePlan(client.PlanId);
        var (handler, botProxy) = MakeHandler(client, plan);

        var result = await handler.Handle(
            new UpdateClientCommand(client.Id, MakeDto(client, plan.Id), ActorId, "Admin", "127.0.0.1"),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        botProxy.Verify(b => b.InvalidateIdentityAsync(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task SoloCambiaOtroCampo_NoAvisaAlChatbot()
    {
        var client = TestEntityFactory.MakeClient(phoneMain: "70000001", fullName: "Nombre Viejo");
        var plan   = MakePlan(client.PlanId);
        var (handler, botProxy) = MakeHandler(client, plan);

        var dto = MakeDto(client, plan.Id) with { FullName = "Nombre Nuevo" };
        var result = await handler.Handle(
            new UpdateClientCommand(client.Id, dto, ActorId, "Admin", "127.0.0.1"),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        botProxy.Verify(b => b.InvalidateIdentityAsync(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task AgregaPhoneSecondaryQueAntesNoTenia_AvisaSoloElNuevo()
    {
        var client = TestEntityFactory.MakeClient(phoneMain: "70000001");
        client.PhoneSecondary = null;
        var plan = MakePlan(client.PlanId);
        var (handler, botProxy) = MakeHandler(client, plan);

        var result = await handler.Handle(
            new UpdateClientCommand(
                client.Id, MakeDto(client, plan.Id, phoneSecondary: "70000099"), ActorId, "Admin", "127.0.0.1"),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        botProxy.Verify(b => b.InvalidateIdentityAsync("70000099"), Times.Once);
        botProxy.Verify(b => b.InvalidateIdentityAsync(It.IsAny<string>()), Times.Once);
    }

    [Fact]
    public async Task SiInvalidateIdentityFalla_NoRompeElGuardadoDelCliente()
    {
        var client = TestEntityFactory.MakeClient(phoneMain: "70000001");
        var plan   = MakePlan(client.PlanId);
        var botProxy = new Mock<IBotOutboundProxy>();
        botProxy.Setup(b => b.InvalidateIdentityAsync(It.IsAny<string>())).ReturnsAsync(false);
        var handler = new UpdateClientHandler(
            SpecificRepoMock.Clients(client).Object, RepoMock.Of(plan).Object, MakeAudit(), botProxy.Object);

        var result = await handler.Handle(
            new UpdateClientCommand(client.Id, MakeDto(client, plan.Id, phoneMain: "70000002"), ActorId, "Admin", "127.0.0.1"),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue("InvalidateIdentityAsync devolver false (o fallar) no debe impedir guardar el cliente");
    }
}
