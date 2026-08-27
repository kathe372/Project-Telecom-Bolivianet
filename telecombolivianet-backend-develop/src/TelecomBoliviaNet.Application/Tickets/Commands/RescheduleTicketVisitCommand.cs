using MediatR;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.DTOs.Tickets;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Application.Services.Notifications;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Notifications;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Tickets.Commands;

public record RescheduleTicketVisitCommand(
    Guid                       TicketId,
    RescheduleTicketVisitDto   Dto,
    Guid                       ActorId,
    string                     ActorName,
    string                     ClientIp,
    string?                    UserAgent = null) : IRequest<Result<TicketVisitDto>>;

public class RescheduleTicketVisitHandler
    : IRequestHandler<RescheduleTicketVisitCommand, Result<TicketVisitDto>>
{
    private readonly ITicketRepository      _ticketRepo;
    private readonly ITicketVisitRepository        _visitRepo;
    private readonly IGenericRepository<TicketComment>      _commentRepo;
    private readonly IGenericRepository<TicketNotification> _notifRepo;
    private readonly IGenericRepository<UserSystem>         _userRepo;
    private readonly INotifPublisher                        _notifPublisher;
    private readonly AuditService                           _audit;
    private readonly IUnitOfWork                            _uow;
    private readonly ILogger<RescheduleTicketVisitHandler>  _logger;

    public RescheduleTicketVisitHandler(
        ITicketRepository      ticketRepo,
        ITicketVisitRepository        visitRepo,
        IGenericRepository<TicketComment>      commentRepo,
        IGenericRepository<TicketNotification> notifRepo,
        IGenericRepository<UserSystem>         userRepo,
        INotifPublisher                        notifPublisher,
        AuditService                           audit,
        IUnitOfWork                            uow,
        ILogger<RescheduleTicketVisitHandler>  logger)
    {
        _ticketRepo     = ticketRepo;
        _visitRepo      = visitRepo;
        _commentRepo    = commentRepo;
        _notifRepo      = notifRepo;
        _userRepo       = userRepo;
        _notifPublisher = notifPublisher;
        _audit          = audit;
        _uow            = uow;
        _logger         = logger;
    }

    public async Task<Result<TicketVisitDto>> Handle(
        RescheduleTicketVisitCommand cmd, CancellationToken ct)
    {
        // 1. Combinar Fecha (YYYY-MM-DD) + Hora (HH:mm) en hora local de Bolivia
        //    y convertir a UTC (Bolivia = UTC-4 fijo, sin horario de verano).
        if (!DateTime.TryParse($"{cmd.Dto.Fecha}T{cmd.Dto.Hora}:00", out var localParsed))
            return Result<TicketVisitDto>.Failure("Fecha u hora con formato inválido. Use YYYY-MM-DD y HH:mm.");

        var local       = DateTime.SpecifyKind(localParsed, DateTimeKind.Unspecified);
        var scheduledAt = TimeZoneInfo.ConvertTimeToUtc(local, NotifShared.BoliviaZone);

        if (scheduledAt <= DateTime.UtcNow.AddMinutes(-5))
            return Result<TicketVisitDto>.Failure("La nueva fecha de visita debe ser futura.");

        // 2. Cargar ticket
        var ticket = await _ticketRepo.GetWithClientAsync(cmd.TicketId, ct);
        if (ticket is null) return Result<TicketVisitDto>.Failure("Ticket no encontrado.");
        if (ticket.Status == TicketStatus.Cerrado)
            return Result<TicketVisitDto>.Failure("No se puede reprogramar visita en un ticket cerrado.");

        // 3. Reprogramar la visita programada más reciente; si no hay, crear una nueva.
        //    (Evita acumular visidas "Programada" duplicadas en el ticket.)
        var visit = await _visitRepo.GetLatestScheduledAsync(cmd.TicketId, ct);

        var motivo = string.IsNullOrWhiteSpace(cmd.Dto.Motivo)
            ? "Reprogramada por el cliente vía WhatsApp"
            : cmd.Dto.Motivo!.Trim();

        UserSystem? tech = null;

        // Se calcula antes de la transacción: lo usan la nota interna de dentro
        // y el aviso al cliente de después.
        var fechaLocalTexto = TimeZoneInfo
            .ConvertTimeFromUtc(scheduledAt, NotifShared.BoliviaZone)
            .ToString("dd/MM/yyyy HH:mm");

        // D-13 — Mover la visita, marcar el ticket "en visita" y dejar la nota
        // interna son una sola cosa. Antes se confirmaban por separado: si fallaba
        // después de mover la visita, el ticket seguía figurando como Abierto y
        // sin ninguna nota, así que nadie sabía por qué la cita había cambiado.
        //
        // El aviso al cliente queda FUERA a propósito, más abajo: sale cuando el
        // cambio ya es un hecho.
        await _uow.BeginTransactionAsync(ct);
        try
        {
        if (visit is null)
        {
            visit = new TicketVisit
            {
                TicketId        = cmd.TicketId,
                ScheduledAt     = scheduledAt,
                Observations    = motivo,
                Status          = VisitStatus.Programada,
                CreatedByUserId = cmd.ActorId,
                CreatedAt       = DateTime.UtcNow,
            };
            await _visitRepo.AddAsync(visit);
        }
        else
        {
            visit.ScheduledAt  = scheduledAt;
            visit.Observations = motivo;
            if (visit.TechnicianId.HasValue)
                tech = await _userRepo.GetByIdAsync(visit.TechnicianId.Value);
            _visitRepo.Update(visit);
        }

        if (ticket.Status is TicketStatus.Abierto or TicketStatus.EnProceso)
            ticket.Status = TicketStatus.EnVisita;


        await _commentRepo.AddAsync(new TicketComment
        {
            TicketId  = cmd.TicketId, AuthorId = cmd.ActorId,
            Type      = CommentType.NotaInterna,
            Body      = $"[Visita reprogramada a {fechaLocalTexto}] {motivo}",
            CreatedAt = DateTime.UtcNow,
        });

            await _visitRepo.SaveChangesAsync();
            await _uow.CommitAsync(ct);
        }
        catch (Exception ex)
        {
            await _uow.RollbackAsync(ct);
            _logger.LogError(ex,
                "Error al reprogramar la visita del ticket {TicketId} — " +
                "no se aplicó ningún cambio.", cmd.TicketId);
            return Result<TicketVisitDto>.Failure(
                "No se pudo reprogramar la visita. No se aplicó ningún cambio.");
        }

        // 4. Notificar al cliente (reutiliza la plantilla VISITA_PROGRAMADA).
        var clientPhone = ticket.Client?.PhoneMain;
        if (!string.IsNullOrWhiteSpace(clientPhone) && ticket.ClientId.HasValue)
        {
            var techName = tech?.FullName ?? "Técnico asignado";

            await _notifPublisher.PublishAsync(
                NotifType.VISITA_PROGRAMADA,
                ticket.ClientId.Value,
                clientPhone,
                new Dictionary<string, string>
                {
                    ["cliente"]    = ticket.Client?.FullName ?? "Cliente",
                    ["num_ticket"] = ticket.TicketNumber ?? ticket.Id.ToString()[..8].ToUpper(),
                    ["fecha"]      = fechaLocalTexto,
                    ["tecnico"]    = techName,
                },
                referenciaId: visit.Id);

            await _notifRepo.AddAsync(new TicketNotification
            {
                TicketId  = ticket.Id, Type = NotificationType.VisitaProgramada,
                Status    = NotificationStatus.Enviado, Recipient = clientPhone,
                Message   = $"VISITA_REPROGRAMADA: {ticket.TicketNumber} — {fechaLocalTexto} con {techName}",
                SentAt    = DateTime.UtcNow,
            });
            await _notifRepo.SaveChangesAsync();
        }

        await _audit.LogAsync("Tickets", "VISIT_RESCHEDULED",
            $"Visita reprogramada a {fechaLocalTexto} en ticket {cmd.TicketId}",
            cmd.ActorId, cmd.ActorName, cmd.ClientIp, cmd.UserAgent);

        // PASO 2B (2026-08): el chatbot necesita el número de ticket legible
        // (TK-2026-0001), no el GUID interno, para mostrárselo al cliente.
        return Result<TicketVisitDto>.Success(new TicketVisitDto(
            visit.Id, visit.ScheduledAt, tech?.FullName, visit.TechnicianId,
            visit.Observations, visit.CreatedAt, visit.Status.ToString(),
            TicketNumber: ticket.TicketNumber));
    }
}
