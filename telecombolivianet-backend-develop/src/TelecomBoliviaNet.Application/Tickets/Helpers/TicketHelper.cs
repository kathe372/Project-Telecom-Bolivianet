using TelecomBoliviaNet.Application.DTOs.Tickets;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Entities.Notifications;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Services;

namespace TelecomBoliviaNet.Application.Tickets.Helpers;

public class TicketHelper
{
    private readonly ITicketRepository                  _ticketRepo;
    private readonly ITicketCommentRepository           _commentRepo;
    private readonly ITicketWorkLogRepository           _workLogRepo;
    private readonly ITicketVisitRepository               _visitRepo;
    private readonly ISlaPlanRepository                       _slaPlanRepo;
    private readonly IGenericRepository<TicketNotification> _notifRepo;
    private readonly IScheduleRepository             _scheduleRepo;
    private readonly IInstallationRepository             _instRepo;
    private readonly INotifPublisher                        _notifPublisher;

    public TicketHelper(
        ITicketRepository                  ticketRepo,
        ITicketCommentRepository           commentRepo,
        ITicketWorkLogRepository           workLogRepo,
        ITicketVisitRepository               visitRepo,
        ISlaPlanRepository                       slaPlanRepo,
        IGenericRepository<TicketNotification> notifRepo,
        IScheduleRepository             scheduleRepo,
        IInstallationRepository             instRepo,
        INotifPublisher                        notifPublisher)
    {
        _ticketRepo     = ticketRepo;
        _commentRepo    = commentRepo;
        _workLogRepo    = workLogRepo;
        _visitRepo      = visitRepo;
        _slaPlanRepo    = slaPlanRepo;
        _notifRepo      = notifRepo;
        _scheduleRepo   = scheduleRepo;
        _instRepo       = instRepo;
        _notifPublisher = notifPublisher;
    }

    public async Task<SupportTicket?> LoadAsync(Guid id) =>
        await _ticketRepo.GetSummaryAsync(id);

    public async Task<TicketDetailDto?> BuildDetailAsync(Guid ticketId)
    {
        var t = await _ticketRepo.GetDetailAsync(ticketId);
        if (t is null) return null;

        var comments = await _commentRepo.GetForTicketAsync(ticketId);
        var workLogs = await _workLogRepo.GetForTicketAsync(ticketId);
        var visits   = await _visitRepo.GetForTicketAsync(ticketId);

        // Ticket de un prospecto (sin Client): la ubicación/caja NAP/zona no
        // viven en un Client sino en la Installation que generó este ticket
        // (ver InstallationFactory.CreateTicket) — sin este fallback, "Ver en
        // mapa"/"Ver en mapa de cobertura" quedaban sin datos para la mayoría
        // de los tickets de instalación agendados por el bot.
        Installation? inst = t.ClientId is null
            ? await _instRepo.GetByTicketAsync(ticketId)
            : null;

        return new TicketDetailDto(
            t.Id, t.Client?.FullName ?? t.ProspectName ?? "", t.Client?.TbnCode ?? "", t.ClientId,
            t.Subject, t.Type.ToString(), t.Priority.ToString(), t.Status.ToString(), t.Origin.ToString(),
            t.Description, t.SupportGroup,
            t.AssignedTo?.FullName, t.AssignedToUserId,
            t.CreatedBy?.FullName ?? "", t.CreatedByUserId,
            t.CreatedAt, t.DueDate, t.ResolvedAt, t.ClosedAt, t.FirstRespondedAt,
            t.SlaCompliant, t.ResolutionMessage, t.RootCause,
            workLogs.Sum(w => w.Minutes),
            comments.Select(c => new TicketCommentDto(c.Id, c.Type.ToString(), c.Body,
                c.Author?.FullName ?? "Sistema", c.AuthorId, c.CreatedAt)),
            workLogs.Select(w => new TicketWorkLogDto(w.Id, w.User?.FullName ?? "?", w.UserId,
                w.Minutes, w.Notes, w.LoggedAt)),
            visits.Select(v => new TicketVisitDto(v.Id, v.ScheduledAt, v.Technician?.FullName,
                v.TechnicianId, v.Observations, v.CreatedAt, v.Status.ToString())),
            SlaTotalPausedMinutes: t.SlaTotalPausedMinutes,
            SlaPausedAt: t.SlaPausedAt,
            TicketNumber: t.TicketNumber,
            ImageUrl: t.ImageUrl,
            ClientGpsLatitude:  t.Client?.GpsLatitude    ?? inst?.GpsLatitude,
            ClientGpsLongitude: t.Client?.GpsLongitude   ?? inst?.GpsLongitude,
            ClientZone:         t.Client?.Zone           ?? inst?.DistributionBox?.Zone?.Nombre,
            ClientStreet:       t.Client?.Street         ?? inst?.Direccion,
            ClientLocationRef:  t.Client?.LocationRef,
            ClientPhone:        t.Client?.PhoneMain      ?? t.ProspectPhone,
            ClientPlanName:     t.Client?.Plan?.Name,
            ProspectIdentityCard: t.ProspectIdentityCard,
            ProspectBackupPhone:  t.ProspectBackupPhone,
            InstallationBoxCode:  inst?.DistributionBox?.Codigo,
            InstallationZoneName: inst?.DistributionBox?.Zone?.Nombre);
    }

    public async Task<DateTime?> GetDueDateFromSlaAsync(
        TicketPriority priority, DateTime? startTime = null)
    {
        var plan = await _slaPlanRepo.GetActiveByPriorityAsync(priority.ToString());
        if (plan is null) return null;
        var from = startTime ?? DateTime.UtcNow;

        if (plan.Schedule != SlaSchedule.Laboral)
            return from.AddMinutes(plan.ResolutionMinutes);

        var schedule = plan.BusinessScheduleId.HasValue
            ? await _scheduleRepo.GetActiveByIdAsync(plan.BusinessScheduleId.Value)
            : await _scheduleRepo.GetActiveAsync();

        if (schedule is null || schedule.Is24x7)
            return from.AddMinutes(plan.ResolutionMinutes);

        var holidays = schedule.Holidays.Select(h => h.Date).ToList();
        return SlaCalculator.AddBusinessMinutes(from, plan.ResolutionMinutes, schedule, holidays);
    }

    public async Task<string?> SendNotificationAsync(
        SupportTicket ticket, UserSystem technician, Client? client, bool reopen = false)
    {
        if (string.IsNullOrWhiteSpace(technician.Phone))
        {
            await _notifRepo.AddAsync(new TicketNotification
            {
                TicketId    = ticket.Id, Type = NotificationType.AsignacionTecnico,
                Status      = NotificationStatus.Fallido, Recipient = string.Empty,
                Message     = string.Empty,
                ErrorDetail = $"El técnico {technician.FullName} no tiene número WhatsApp registrado.",
                SentAt      = DateTime.UtcNow,
            });
            return $"El técnico {technician.FullName} no tiene número WhatsApp registrado. Notificación no enviada.";
        }

        if (client is null)
        {
            // Ticket de un prospecto (sin Client real): NotifOutbox.ClienteId es
            // un FK obligatorio a Clients, así que no hay forma válida de
            // publicar esta notificación — antes esto reventaba con una
            // violación de FK (ClienteId = Guid.Empty) al asignar técnico a un
            // ticket de prospecto.
            await _notifRepo.AddAsync(new TicketNotification
            {
                TicketId    = ticket.Id, Type = NotificationType.AsignacionTecnico,
                Status      = NotificationStatus.Fallido, Recipient = string.Empty,
                Message     = string.Empty,
                ErrorDetail = "El ticket es de un prospecto sin cliente registrado; no se puede publicar la notificación de asignación.",
                SentAt      = DateTime.UtcNow,
            });
            return "El ticket es de un prospecto sin cliente registrado. Notificación de asignación no enviada.";
        }

        var prefix  = reopen ? "REAPERTURA" : "ASIGNACIÓN";
        var dueText = ticket.DueDate?.ToString("dd/MM/yyyy HH:mm") ?? "Sin fecha límite";

        await _notifPublisher.PublishAsync(
            NotifType.TICKET_ASIGNADO,
            client.Id,
            technician.Phone,
            new Dictionary<string, string>
            {
                ["prefijo"]   = prefix,
                ["ticket_id"] = ticket.Id.ToString()[..8].ToUpper(),
                ["asunto"]    = ticket.Subject,
                ["cliente"]   = client.FullName,
                ["prioridad"] = ticket.Priority.ToString(),
                ["vence"]     = dueText,
                ["tecnico"]   = technician.FullName,
            },
            referenciaId: ticket.Id);

        await _notifRepo.AddAsync(new TicketNotification
        {
            TicketId  = ticket.Id, Type = NotificationType.AsignacionTecnico,
            Status    = NotificationStatus.Enviado,
            Recipient = technician.Phone,
            Message   = $"[{prefix}] Ticket #{ticket.Id.ToString()[..8].ToUpper()} — publicado en outbox",
            SentAt    = DateTime.UtcNow,
        });

        return null;
    }

    public static TicketListItemDto MapToListItem(SupportTicket t)
    {
        // Próxima visita programada (no cancelada), la más próxima en el tiempo.
        // Requiere que el caller haya hecho Include(t => t.Visits).ThenInclude(v => v.Technician);
        // si no se incluyó, t.Visits queda vacío y esto simplemente no rompe nada.
        var nextVisit = t.Visits?
            .Where(v => v.Status == VisitStatus.Programada)
            .OrderBy(v => v.ScheduledAt)
            .FirstOrDefault();

        return new(
            t.Id, t.Client?.FullName ?? t.ProspectName ?? "", t.Client?.TbnCode ?? "", t.ClientId,
            t.Subject, t.Type.ToString(), t.Priority.ToString(), t.Status.ToString(), t.Origin.ToString(),
            t.Description, t.SupportGroup, t.AssignedTo?.FullName, t.AssignedToUserId,
            t.CreatedBy?.FullName ?? "", t.CreatedAt, t.DueDate, t.ResolvedAt,
            t.FirstRespondedAt, t.SlaCompliant, t.WorkLogs?.Sum(w => w.Minutes) ?? 0,
            t.TicketNumber, t.SlaDeadline, t.AutoAssigned,
            NextVisitAt:             nextVisit?.ScheduledAt,
            NextVisitTechnicianName: nextVisit?.Technician?.FullName);
    }

    public static SlaPlanDto MapSlaPlan(SlaPlan p) =>
        new(p.Id, p.Name, p.Priority, p.FirstResponseMinutes, p.ResolutionMinutes, p.Schedule.ToString(), p.IsActive);
}
