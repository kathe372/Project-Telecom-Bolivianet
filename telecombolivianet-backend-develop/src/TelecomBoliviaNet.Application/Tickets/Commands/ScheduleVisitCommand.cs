using MediatR;
using TelecomBoliviaNet.Application.DTOs.Tickets;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Notifications;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Tickets.Commands;

public record ScheduleVisitCommand(
    Guid             TicketId,
    ScheduleVisitDto Dto,
    Guid             ActorId,
    string           ActorName,
    string           ClientIp,
    string?          UserAgent = null) : IRequest<Result<TicketVisitDto>>;

public class ScheduleVisitHandler : IRequestHandler<ScheduleVisitCommand, Result<TicketVisitDto>>
{
    private readonly ITicketRepository   _ticketRepo;
    private readonly IGenericRepository<TicketVisit>     _visitRepo;
    private readonly IGenericRepository<TicketComment>   _commentRepo;
    private readonly IGenericRepository<TicketNotification> _notifRepo;
    private readonly IGenericRepository<UserSystem>      _userRepo;
    private readonly INotifPublisher                     _notifPublisher;
    private readonly AuditService                        _audit;

    public ScheduleVisitHandler(
        ITicketRepository      ticketRepo,
        IGenericRepository<TicketVisit>        visitRepo,
        IGenericRepository<TicketComment>      commentRepo,
        IGenericRepository<TicketNotification> notifRepo,
        IGenericRepository<UserSystem>         userRepo,
        INotifPublisher                        notifPublisher,
        AuditService                           audit)
    {
        _ticketRepo     = ticketRepo;
        _visitRepo      = visitRepo;
        _commentRepo    = commentRepo;
        _notifRepo      = notifRepo;
        _userRepo       = userRepo;
        _notifPublisher = notifPublisher;
        _audit          = audit;
    }

    /// <summary>
    /// Lleva a UTC una fecha que puede venir en cualquier <see cref="DateTimeKind"/>.
    ///
    ///  · <b>Utc</b>       → tal cual.
    ///  · <b>Local</b>     → <c>ToUniversalTime()</c>, que CONVIERTE usando la zona del
    ///    proceso. Es el caso del chatbot, que manda offset explícito (<c>-04:00</c>)
    ///    y el deserializador entrega Kind=Local.
    ///  · <b>Unspecified</b> → se asume que ya es UTC (mismo criterio que el resto
    ///    del módulo: sin offset, el emisor manda hora UTC).
    ///
    /// Ojo con la diferencia entre <c>ToUniversalTime()</c> y
    /// <c>SpecifyKind(..., Utc)</c>: el primero convierte, el segundo solo cambia la
    /// etiqueta. Usar SpecifyKind sobre una hora local corre el valor tantas horas
    /// como diga el offset de la máquina.
    /// </summary>
    public static DateTime ToUtc(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc   => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _                  => DateTime.SpecifyKind(value, DateTimeKind.Utc),
    };

    public async Task<Result<TicketVisitDto>> Handle(ScheduleVisitCommand cmd, CancellationToken ct)
    {
        var ticket = await _ticketRepo.GetWithClientAsync(cmd.TicketId, ct);
        if (ticket is null) return Result<TicketVisitDto>.Failure("Ticket no encontrado.");
        if (ticket.Status == TicketStatus.Cerrado)
            return Result<TicketVisitDto>.Failure("No se puede programar visita en ticket cerrado.");

        UserSystem? tech = null;
        if (cmd.Dto.TechnicianId.HasValue)
        {
            tech = await _userRepo.GetByIdAsync(cmd.Dto.TechnicianId.Value);
            if (tech is null) return Result<TicketVisitDto>.Failure("Técnico no encontrado.");
        }

        // D1/C1 (2026-08-07): el chatbot manda la hora con offset explícito
        // ("2026-08-11T10:00:00-04:00"), que System.Text.Json deserializa como
        // DateTime con Kind=Local. Npgsql se niega a escribir Kind=Local en una
        // columna timestamptz → DbUpdateException → 500 sin controlar. Efecto en
        // producción: NINGUNA visita técnica se podía agendar desde WhatsApp
        // (TicketVisits vacía), y el cliente recibía "intente en unos minutos",
        // que fallaba idéntico siempre.
        //
        // Se normaliza UNA sola vez acá, antes de construir la entidad, y se usa
        // el mismo valor en la entidad, el comentario y la notificación. Antes
        // solo la notificación se defendía —y encima mal: SpecifyKind(Utc)
        // REINTERPRETA la hora local como UTC en vez de convertirla, lo que solo
        // acierta si el contenedor corre en UTC.
        var scheduledUtc = ToUtc(cmd.Dto.ScheduledAt);

        var visit = new TicketVisit
        {
            TicketId        = cmd.TicketId,
            ScheduledAt     = scheduledUtc,
            TechnicianId    = cmd.Dto.TechnicianId,
            Observations    = cmd.Dto.Observations?.Trim(),
            Status          = VisitStatus.Programada,
            CreatedByUserId = cmd.ActorId,
            CreatedAt       = DateTime.UtcNow,
        };
        await _visitRepo.AddAsync(visit);

        if (ticket.Status is TicketStatus.Abierto or TicketStatus.EnProceso)
            ticket.Status = TicketStatus.EnVisita;

        if (!string.IsNullOrWhiteSpace(cmd.Dto.Observations))
            await _commentRepo.AddAsync(new TicketComment
            {
                TicketId  = cmd.TicketId, AuthorId = cmd.ActorId,
                Type      = CommentType.NotaInterna,
                Body      = $"[Visita programada {scheduledUtc:dd/MM/yyyy HH:mm}] {cmd.Dto.Observations}",
                CreatedAt = DateTime.UtcNow,
            });

        await _visitRepo.SaveChangesAsync();

        var clientPhone = ticket.Client?.PhoneMain;
        if (!string.IsNullOrWhiteSpace(clientPhone) && ticket.ClientId.HasValue)
        {
            var techName = tech?.FullName ?? "Técnico asignado";
            var fechaLocal = TimeZoneInfo.ConvertTimeFromUtc(
                scheduledUtc,
                TelecomBoliviaNet.Application.Services.Notifications.NotifShared.BoliviaZone
            ).ToString("dd/MM/yyyy HH:mm");

            await _notifPublisher.PublishAsync(
                NotifType.VISITA_PROGRAMADA,
                ticket.ClientId.Value,
                clientPhone,
                new Dictionary<string, string>
                {
                    ["cliente"]   = ticket.Client?.FullName ?? "Cliente",
                    ["num_ticket"] = ticket.TicketNumber ?? ticket.Id.ToString()[..8].ToUpper(),
                    ["fecha"]     = fechaLocal,
                    ["tecnico"]   = techName,
                },
                referenciaId: visit.Id);

            await _notifRepo.AddAsync(new TicketNotification
            {
                TicketId  = ticket.Id, Type = NotificationType.VisitaProgramada,
                Status    = NotificationStatus.Enviado, Recipient = clientPhone,
                Message   = $"VISITA_PROGRAMADA: {ticket.TicketNumber} — {fechaLocal} con {techName}",
                SentAt    = DateTime.UtcNow,
            });
            await _notifRepo.SaveChangesAsync();
        }

        await _audit.LogAsync("Tickets", "VISIT_SCHEDULED",
            $"Visita {cmd.Dto.ScheduledAt:dd/MM} en ticket {cmd.TicketId}",
            cmd.ActorId, cmd.ActorName, cmd.ClientIp, cmd.UserAgent);

        return Result<TicketVisitDto>.Success(new TicketVisitDto(
            visit.Id, visit.ScheduledAt, tech?.FullName, visit.TechnicianId,
            visit.Observations, visit.CreatedAt, visit.Status.ToString()));
    }
}
