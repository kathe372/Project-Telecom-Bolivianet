using Microsoft.Extensions.Logging.Abstractions;
﻿using TelecomBoliviaNet.Application.DTOs.Tickets;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Tickets.Commands;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.UnitTests.Services;

/// <summary>
/// Reprogramación de la visita técnica de un ticket vía chatbot (Plan B).
/// Endpoint PATCH /api/tickets/{id}/reschedule → RescheduleTicketVisitCommand.
/// Verifica: conversión de hora local Bolivia→UTC, reprogramación in-place
/// (sin duplicar visitas), creación cuando no hay visita, notificación al
/// cliente y guardas de negocio (ticket cerrado / fecha pasada).
/// </summary>
public class RescheduleTicketVisitHandlerTests
{
    /// <summary>D-13: la operación va en una transacción; el doble no estorba.</summary>
    private static IUnitOfWork NoopUow()
    {
        var uow = new Mock<IUnitOfWork>(MockBehavior.Loose);
        uow.Setup(u => u.BeginTransactionAsync(It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        uow.Setup(u => u.CommitAsync(It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        uow.Setup(u => u.RollbackAsync(It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        return uow.Object;
    }

    private readonly Mock<ITicketRepository>                      _ticketRepo = new(MockBehavior.Loose);
    private readonly Mock<ITicketVisitRepository>                 _visitRepo  = new(MockBehavior.Loose);
    private readonly Mock<IGenericRepository<TicketComment>>      _commentRepo = new(MockBehavior.Loose);
    private readonly Mock<IGenericRepository<TicketNotification>> _notifRepo  = new(MockBehavior.Loose);
    private readonly Mock<IUserRepository>                        _userRepo   = new(MockBehavior.Loose);
    private readonly Mock<INotifPublisher>                        _publisher  = new(MockBehavior.Loose);

    private RescheduleTicketVisitHandler Build(SupportTicket ticket, List<TicketVisit> visits)
    {
        _ticketRepo.Setup(r => r.GetWithClientAsync(ticket.Id, It.IsAny<CancellationToken>()))
                   .ReturnsAsync(ticket);
        _visitRepo.Setup(r => r.GetLatestScheduledAsync(
                       It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
                  .ReturnsAsync(() => visits
                       .Where(v => v.Status == VisitStatus.Programada)
                       .OrderByDescending(v => v.ScheduledAt)
                       .FirstOrDefault());
        return new RescheduleTicketVisitHandler(
            _ticketRepo.Object, _visitRepo.Object, _commentRepo.Object,
            _notifRepo.Object, _userRepo.Object, _publisher.Object, TestAudit.Real(),
            NoopUow(), NullLogger<RescheduleTicketVisitHandler>.Instance);
    }

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
        };
    }

    private static RescheduleTicketVisitCommand Cmd(Guid ticketId, string fecha, string hora) =>
        new(ticketId, new RescheduleTicketVisitDto { Fecha = fecha, Hora = hora },
            Guid.NewGuid(), "Bot Chatbot", "127.0.0.1");

    // Fecha futura fija para evitar que el guard "debe ser futura" haga flaky el test.
    private static string FutureDate() => DateTime.UtcNow.AddDays(10).ToString("yyyy-MM-dd");

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
        var handler = Build(ticket, new List<TicketVisit> { visit });

        var result = await handler.Handle(Cmd(ticket.Id, FutureDate(), "15:00"), default);

        result.IsSuccess.Should().BeTrue();
        // Reprograma la visita existente en sitio → NO crea una nueva.
        _visitRepo.Verify(r => r.AddAsync(It.IsAny<TicketVisit>()), Times.Never);
        _visitRepo.Verify(r => r.Update(visit), Times.Once);
    }

    [Fact]
    public async Task Creates_Visit_WhenNoneExists()
    {
        var ticket  = MakeTicket();
        var handler = Build(ticket, new List<TicketVisit>());

        var result = await handler.Handle(Cmd(ticket.Id, FutureDate(), "10:30"), default);

        result.IsSuccess.Should().BeTrue();
        _visitRepo.Verify(r => r.AddAsync(It.IsAny<TicketVisit>()), Times.Once);
    }

    [Fact]
    public async Task ConvertsBoliviaLocalTime_ToUtc()
    {
        var ticket = MakeTicket();
        var visit  = new TicketVisit
        {
            TicketId = ticket.Id, ScheduledAt = DateTime.UtcNow.AddDays(2),
            Status = VisitStatus.Programada,
        };
        Build(ticket, new List<TicketVisit> { visit });

        var result = await new RescheduleTicketVisitHandler(
            _ticketRepo.Object, _visitRepo.Object, _commentRepo.Object,
            _notifRepo.Object, _userRepo.Object, _publisher.Object, TestAudit.Real(),
            NoopUow(), NullLogger<RescheduleTicketVisitHandler>.Instance)
            .Handle(Cmd(ticket.Id, "2026-12-01", "15:00"), default);

        result.IsSuccess.Should().BeTrue();
        // 15:00 hora Bolivia (UTC-4) == 19:00 UTC
        visit.ScheduledAt.Should().Be(new DateTime(2026, 12, 1, 19, 0, 0, DateTimeKind.Utc));
        visit.ScheduledAt.Kind.Should().Be(DateTimeKind.Utc);
    }

    [Fact]
    public async Task NotifiesClient_WithVisitaProgramada()
    {
        var ticket  = MakeTicket();
        var handler = Build(ticket, new List<TicketVisit>());

        await handler.Handle(Cmd(ticket.Id, FutureDate(), "09:00"), default);

        _publisher.Verify(p => p.PublishAsync(
            NotifType.VISITA_PROGRAMADA,
            ticket.ClientId!.Value,
            "59171234567",
            It.IsAny<Dictionary<string, string>>(),
            It.IsAny<Guid?>()), Times.Once);
    }

    [Fact]
    public async Task SetsTicketStatus_ToEnVisita()
    {
        var ticket  = MakeTicket(TicketStatus.Abierto);
        var handler = Build(ticket, new List<TicketVisit>());

        await handler.Handle(Cmd(ticket.Id, FutureDate(), "11:00"), default);

        ticket.Status.Should().Be(TicketStatus.EnVisita);
    }

    [Fact]
    public async Task Rejects_ClosedTicket()
    {
        var ticket  = MakeTicket(TicketStatus.Cerrado);
        var handler = Build(ticket, new List<TicketVisit>());

        var result = await handler.Handle(Cmd(ticket.Id, FutureDate(), "12:00"), default);

        result.IsSuccess.Should().BeFalse();
        _visitRepo.Verify(r => r.AddAsync(It.IsAny<TicketVisit>()), Times.Never);
        _publisher.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task Rejects_PastDate()
    {
        var ticket  = MakeTicket();
        var handler = Build(ticket, new List<TicketVisit>());

        var pastDate = DateTime.UtcNow.AddDays(-3).ToString("yyyy-MM-dd");
        var result   = await handler.Handle(Cmd(ticket.Id, pastDate, "12:00"), default);

        result.IsSuccess.Should().BeFalse();
        _publisher.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task PASO_2B_ReturnsTicketNumber_NotJustGuid()
    {
        var ticket  = MakeTicket();
        var handler = Build(ticket, new List<TicketVisit>());

        var result = await handler.Handle(Cmd(ticket.Id, FutureDate(), "09:00"), default);

        result.IsSuccess.Should().BeTrue();
        result.Value!.TicketNumber.Should().Be("TK-2026-0001");
    }

    [Fact]
    public async Task Rejects_TicketNotFound()
    {
        var ticket  = MakeTicket();
        var handler = Build(ticket, new List<TicketVisit>());

        var result = await handler.Handle(Cmd(Guid.NewGuid(), FutureDate(), "12:00"), default);

        result.IsSuccess.Should().BeFalse();
    }
}
