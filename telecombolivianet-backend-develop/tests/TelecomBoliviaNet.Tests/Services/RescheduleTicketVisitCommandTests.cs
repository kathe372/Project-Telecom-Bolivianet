using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using TelecomBoliviaNet.Application.DTOs.Tickets;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Application.Tickets.Commands;
using TelecomBoliviaNet.Domain.Entities.Audit;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Notifications;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Tests.Helpers;
using Xunit;

namespace TelecomBoliviaNet.Tests.Services;

/// <summary>
/// PASO 2B (2026-08): el chatbot necesita el número de ticket legible
/// (TK-2026-0001) en la respuesta de reprogramar visita, no solo el GUID
/// interno — antes `TicketVisitDto` no lo exponía y `reschedule-ticket.tool.ts`
/// mostraba el GUID crudo al cliente. No existía cobertura de este handler
/// en el proyecto de tests real (solo en un proyecto huérfano fuera de la
/// solución, `TelecomBoliviaNet.UnitTests`, que además no compila hoy).
/// </summary>
public class RescheduleTicketVisitCommandTests
{
    private static readonly Guid ActorId = Guid.NewGuid();

    private static AuditService MakeAudit()
        => new(RepoMock.Empty<AuditLog>().Object, NullLogger<AuditService>.Instance);

    private static SupportTicket MakeTicket(TicketStatus status = TicketStatus.EnProceso)
    {
        var client = TestEntityFactory.MakeClient(phoneMain: "59171234567");
        return new SupportTicket
        {
            Status       = status,
            ClientId     = client.Id,
            Client       = client,
            TicketNumber = "TK-2026-0001",
            Subject      = "Sin conexión",
            Type         = TicketType.SoporteTecnico,
            Priority     = TicketPriority.Alta,
            Origin       = TicketOrigin.Bot,
            CreatedByUserId = ActorId,
        };
    }

    private static RescheduleTicketVisitHandler MakeHandler(SupportTicket ticket, List<TicketVisit> visits)
    {
        var ticketRepo = RepoMock.Of(ticket);
        var visitRepo  = RepoMock.Of(visits.ToArray());
        var commentRepo = RepoMock.Empty<TicketComment>();
        var notifRepo   = RepoMock.Empty<TicketNotification>();
        var userRepo    = RepoMock.Empty<UserSystem>();
        var publisher   = new Mock<INotifPublisher>();
        publisher.Setup(p => p.PublishAsync(
                It.IsAny<NotifType>(), It.IsAny<Guid>(), It.IsAny<string?>(),
                It.IsAny<Dictionary<string, string>>(), It.IsAny<Guid?>()))
            .Returns(Task.CompletedTask);

        return new RescheduleTicketVisitHandler(
            ticketRepo.Object, visitRepo.Object, commentRepo.Object,
            notifRepo.Object, userRepo.Object, publisher.Object, MakeAudit());
    }

    private static RescheduleTicketVisitCommand Cmd(Guid ticketId, string fecha, string hora)
        => new(ticketId, new RescheduleTicketVisitDto { Fecha = fecha, Hora = hora },
               ActorId, "Bot Chatbot", "127.0.0.1");

    private static string FutureDate() => DateTime.UtcNow.AddDays(10).ToString("yyyy-MM-dd");

    [Fact]
    public async Task PASO_2B_ReturnsTicketNumber_NotJustGuid()
    {
        var ticket  = MakeTicket();
        var handler = MakeHandler(ticket, new List<TicketVisit>());

        var result = await handler.Handle(Cmd(ticket.Id, FutureDate(), "09:00"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.TicketNumber.Should().Be("TK-2026-0001");
    }

    [Fact]
    public async Task Reschedules_ExistingProgramadaVisit_InPlace_NoDuplicate()
    {
        var ticket = MakeTicket();
        var visit  = new TicketVisit
        {
            TicketId    = ticket.Id,
            ScheduledAt = DateTime.UtcNow.AddDays(2),
            Status      = VisitStatus.Programada,
        };
        var handler = MakeHandler(ticket, new List<TicketVisit> { visit });

        var result = await handler.Handle(Cmd(ticket.Id, FutureDate(), "15:00"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Id.Should().Be(visit.Id);
    }

    [Fact]
    public async Task Rejects_ClosedTicket()
    {
        var ticket  = MakeTicket(TicketStatus.Cerrado);
        var handler = MakeHandler(ticket, new List<TicketVisit>());

        var result = await handler.Handle(Cmd(ticket.Id, FutureDate(), "12:00"), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
    }

    [Fact]
    public async Task Rejects_PastDate()
    {
        var ticket  = MakeTicket();
        var handler = MakeHandler(ticket, new List<TicketVisit>());

        var pastDate = DateTime.UtcNow.AddDays(-3).ToString("yyyy-MM-dd");
        var result   = await handler.Handle(Cmd(ticket.Id, pastDate, "12:00"), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
    }

    [Fact]
    public async Task Rejects_TicketNotFound()
    {
        var ticket  = MakeTicket();
        var handler = MakeHandler(ticket, new List<TicketVisit>());

        var result = await handler.Handle(Cmd(Guid.NewGuid(), FutureDate(), "12:00"), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
    }
}
