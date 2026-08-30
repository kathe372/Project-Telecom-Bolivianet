using TelecomBoliviaNet.Application.DTOs.Tickets;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Tickets.Services;

/// <summary>
/// Compone la ficha completa de un ticket: sus comentarios, sus partes de
/// trabajo, sus visitas y —si es de un prospecto— la instalación que lo originó.
/// </summary>
/// <remarks>
/// E-01 — Salió de <c>TicketHelper</c> junto con <c>LoadAsync</c>, que es la otra
/// cara de lo mismo: cargar el ticket para trabajar con él. Sus cinco
/// dependencias son todas de lectura y todas hacen falta para esta ficha, que es
/// lo que distingue un caso de uso legítimo de un cajón de sastre.
/// </remarks>
public class TicketDetailBuilder
{
    private readonly ITicketRepository        _ticketRepo;
    private readonly ITicketCommentRepository _commentRepo;
    private readonly ITicketWorkLogRepository _workLogRepo;
    private readonly ITicketVisitRepository   _visitRepo;
    private readonly IInstallationRepository  _instRepo;

    public TicketDetailBuilder(
        ITicketRepository        ticketRepo,
        ITicketCommentRepository commentRepo,
        ITicketWorkLogRepository workLogRepo,
        ITicketVisitRepository   visitRepo,
        IInstallationRepository  instRepo)
    {
        _ticketRepo  = ticketRepo;
        _commentRepo = commentRepo;
        _workLogRepo = workLogRepo;
        _visitRepo   = visitRepo;
        _instRepo    = instRepo;
    }

    /// <summary>El ticket, para trabajar con él. Sin sus colecciones.</summary>
    public Task<SupportTicket?> CargarAsync(Guid id) => _ticketRepo.GetSummaryAsync(id);

    public async Task<TicketDetailDto?> ConstruirAsync(Guid ticketId)
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
}
