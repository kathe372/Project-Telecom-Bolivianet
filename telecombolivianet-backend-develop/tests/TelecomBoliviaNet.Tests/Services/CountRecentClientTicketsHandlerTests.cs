using FluentAssertions;
using TelecomBoliviaNet.Application.Tickets.Queries;
using TelecomBoliviaNet.Domain.Entities.Admin;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Tests.Helpers;
using Xunit;

namespace TelecomBoliviaNet.Tests.Services;

/// <summary>PASO 16 Fase A: CountRecentClientTicketsQuery — detección de reclamos recurrentes.</summary>
public class CountRecentClientTicketsHandlerTests
{
    private static readonly Guid ClientId  = Guid.NewGuid();
    private static readonly Guid OtherClientId = Guid.NewGuid();

    private static SupportTicket MakeTicket(
        Guid? clientId = null, TicketType type = TicketType.SoporteTecnico, int daysAgo = 0) => new()
    {
        Id          = Guid.NewGuid(),
        ClientId    = clientId ?? ClientId,
        Subject     = "Test",
        Type        = type,
        Priority    = TicketPriority.Media,
        Status      = TicketStatus.Cerrado,
        Origin      = TicketOrigin.Bot,
        Description = "Test",
        CreatedAt   = DateTime.UtcNow.AddDays(-daysAgo),
    };

    [Fact]
    public async Task UnTicketPrevioDelMismoTipoEnLaVentana_Cuenta1()
    {
        var ticketRepo = RepoMock.Of(MakeTicket(type: TicketType.SoporteTecnico, daysAgo: 5));
        var handler = new CountRecentClientTicketsHandler(ticketRepo.Object, RepoMock.Empty<SystemConfig>().Object);

        var count = await handler.Handle(
            new CountRecentClientTicketsQuery(ClientId, TicketType.SoporteTecnico, SinceDays: 0),
            CancellationToken.None);

        count.Should().Be(1);
    }

    [Fact]
    public async Task SinTicketsPrevios_Cuenta0()
    {
        var handler = new CountRecentClientTicketsHandler(
            RepoMock.Empty<SupportTicket>().Object, RepoMock.Empty<SystemConfig>().Object);

        var count = await handler.Handle(
            new CountRecentClientTicketsQuery(ClientId, TicketType.SoporteTecnico, SinceDays: 0),
            CancellationToken.None);

        count.Should().Be(0);
    }

    [Fact]
    public async Task TicketFueraDeLaVentana_NoCuenta()
    {
        var ticketRepo = RepoMock.Of(MakeTicket(type: TicketType.SoporteTecnico, daysAgo: 90));
        var handler = new CountRecentClientTicketsHandler(ticketRepo.Object, RepoMock.Empty<SystemConfig>().Object);

        var count = await handler.Handle(
            new CountRecentClientTicketsQuery(ClientId, TicketType.SoporteTecnico, SinceDays: 30),
            CancellationToken.None);

        count.Should().Be(0);
    }

    [Fact]
    public async Task TicketDeOtroTipo_NoCuenta()
    {
        var ticketRepo = RepoMock.Of(MakeTicket(type: TicketType.TvCable, daysAgo: 5));
        var handler = new CountRecentClientTicketsHandler(ticketRepo.Object, RepoMock.Empty<SystemConfig>().Object);

        var count = await handler.Handle(
            new CountRecentClientTicketsQuery(ClientId, TicketType.SoporteTecnico, SinceDays: 30),
            CancellationToken.None);

        count.Should().Be(0);
    }

    [Fact]
    public async Task TicketDeOtroCliente_NoCuenta()
    {
        var ticketRepo = RepoMock.Of(MakeTicket(clientId: OtherClientId, type: TicketType.SoporteTecnico, daysAgo: 5));
        var handler = new CountRecentClientTicketsHandler(ticketRepo.Object, RepoMock.Empty<SystemConfig>().Object);

        var count = await handler.Handle(
            new CountRecentClientTicketsQuery(ClientId, TicketType.SoporteTecnico, SinceDays: 30),
            CancellationToken.None);

        count.Should().Be(0);
    }

    [Fact]
    public async Task VariosTicketsDelMismoTipoEnLaVentana_CuentaTodos()
    {
        var ticketRepo = RepoMock.Of(
            MakeTicket(type: TicketType.SoporteTecnico, daysAgo: 2),
            MakeTicket(type: TicketType.SoporteTecnico, daysAgo: 10),
            MakeTicket(type: TicketType.SoporteTecnico, daysAgo: 20));
        var handler = new CountRecentClientTicketsHandler(ticketRepo.Object, RepoMock.Empty<SystemConfig>().Object);

        var count = await handler.Handle(
            new CountRecentClientTicketsQuery(ClientId, TicketType.SoporteTecnico, SinceDays: 30),
            CancellationToken.None);

        count.Should().Be(3);
    }

    [Fact]
    public async Task SinConfig_UsaVentanaPorDefecto30Dias()
    {
        // 25 días atrás: dentro del default (30) pero quedaría afuera con una
        // ventana más corta — confirma que el fallback de 30 días se usa cuando
        // no hay SystemConfig y el llamador no pide un SinceDays explícito.
        var ticketRepo = RepoMock.Of(MakeTicket(type: TicketType.SoporteTecnico, daysAgo: 25));
        var handler = new CountRecentClientTicketsHandler(ticketRepo.Object, RepoMock.Empty<SystemConfig>().Object);

        var count = await handler.Handle(
            new CountRecentClientTicketsQuery(ClientId, TicketType.SoporteTecnico, SinceDays: 0),
            CancellationToken.None);

        count.Should().Be(1);
    }

    [Fact]
    public async Task ConConfig_UsaLaVentanaConfigurada()
    {
        var config = new SystemConfig
        {
            Id = Guid.NewGuid(), Key = SystemConfigKeys.SupportRecurrentWindowDays, Value = "10",
        };
        var configRepo = RepoMock.Of(config);
        // 25 días atrás queda AFUERA de una ventana configurada de 10 días.
        var ticketRepo = RepoMock.Of(MakeTicket(type: TicketType.SoporteTecnico, daysAgo: 25));
        var handler = new CountRecentClientTicketsHandler(ticketRepo.Object, configRepo.Object);

        var count = await handler.Handle(
            new CountRecentClientTicketsQuery(ClientId, TicketType.SoporteTecnico, SinceDays: 0),
            CancellationToken.None);

        count.Should().Be(0);
    }
}
