using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Notifications;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Tickets.Services;

/// <summary>
/// Avisa por WhatsApp al técnico al que se le asigna (o reasigna) un ticket.
/// </summary>
/// <remarks>
/// E-01 — Salió de <c>TicketHelper</c>. Devuelve un <b>aviso para el operador</b>
/// —no una excepción— cuando no se puede notificar: la asignación en sí es válida
/// y no debe deshacerse porque el técnico no tenga teléfono.
/// </remarks>
public class TicketAssignmentNotifier
{
    private readonly IGenericRepository<TicketNotification> _notifRepo;
    private readonly INotifPublisher                        _notifPublisher;

    public TicketAssignmentNotifier(
        IGenericRepository<TicketNotification> notifRepo,
        INotifPublisher                        notifPublisher)
    {
        _notifRepo      = notifRepo;
        _notifPublisher = notifPublisher;
    }

    /// <returns>
    /// <c>null</c> si se encoló el aviso; si no, el texto que hay que mostrarle al
    /// operador explicando por qué no salió.
    /// </returns>
    public async Task<string?> NotificarAsync(
        SupportTicket ticket, UserSystem technician, Client? client, bool reopen = false)
    {
        if (string.IsNullOrWhiteSpace(technician.Phone))
        {
            await RegistrarFalloAsync(ticket,
                $"El técnico {technician.FullName} no tiene número WhatsApp registrado.");
            return $"El técnico {technician.FullName} no tiene número WhatsApp registrado. Notificación no enviada.";
        }

        if (client is null)
        {
            // Ticket de un prospecto (sin Client real): NotifOutbox.ClienteId es
            // un FK obligatorio a Clients, así que no hay forma válida de
            // publicar esta notificación — antes esto reventaba con una
            // violación de FK (ClienteId = Guid.Empty) al asignar técnico a un
            // ticket de prospecto.
            await RegistrarFalloAsync(ticket,
                "El ticket es de un prospecto sin cliente registrado; no se puede publicar la notificación de asignación.");
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

    private Task RegistrarFalloAsync(SupportTicket ticket, string motivo)
        => _notifRepo.AddAsync(new TicketNotification
        {
            TicketId    = ticket.Id, Type = NotificationType.AsignacionTecnico,
            Status      = NotificationStatus.Fallido, Recipient = string.Empty,
            Message     = string.Empty,
            ErrorDetail = motivo,
            SentAt      = DateTime.UtcNow,
        });
}
