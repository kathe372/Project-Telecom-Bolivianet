using TelecomBoliviaNet.Domain.Entities.Audit;
using TelecomBoliviaNet.Application.DTOs.Clients;
using TelecomBoliviaNet.Domain.Entities.Admin;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Notifications;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;

using TelecomBoliviaNet.Application.Interfaces;

namespace TelecomBoliviaNet.Application.Services.Clients;

public class ClientHistoryService : IClientHistoryService
{
    private readonly IPaymentRepository           _paymentRepo;
    private readonly IInvoiceRepository           _invoiceRepo;
    private readonly ITicketRepository            _ticketRepo;
    private readonly IAuditLogRepository          _auditRepo;
    private readonly INotifLogRepository          _notifRepo;
    private readonly IClientAttachmentRepository  _attachRepo;
    private readonly IPlanChangeRequestRepository _planChangeRepo;

    public ClientHistoryService(
        IPaymentRepository           paymentRepo,
        IInvoiceRepository           invoiceRepo,
        ITicketRepository            ticketRepo,
        IAuditLogRepository          auditRepo,
        INotifLogRepository          notifRepo,
        IClientAttachmentRepository  attachRepo,
        IPlanChangeRequestRepository planChangeRepo)
    {
        _paymentRepo     = paymentRepo;
        _invoiceRepo     = invoiceRepo;
        _ticketRepo      = ticketRepo;
        _auditRepo       = auditRepo;
        _notifRepo       = notifRepo;
        _attachRepo      = attachRepo;
        _planChangeRepo  = planChangeRepo;
    }

    public async Task<ClientHistoryDto> GetHistorialAsync(
        Guid clientId, int page, int pageSize,
        string? tipoFilter, DateTime? desde, DateTime? hasta)
    {
        var items = new List<ClientActivityItemDto>();

        if (tipoFilter is null or "Pago")
        {
            var pagos = await _paymentRepo.GetForClientBetweenAsync(clientId, desde, hasta);

            items.AddRange(pagos.Select(p => new ClientActivityItemDto(
                p.Id, "Pago",
                $"Pago de Bs. {p.Amount:F2} ({p.Method})",
                p.RegisteredBy?.FullName ?? "Sistema",
                p.PaidAt,
                p.Id.ToString(), null)));
        }

        if (tipoFilter is null or "Factura")
        {
            var facturas = await _invoiceRepo.GetForClientBetweenAsync(clientId, desde, hasta);

            items.AddRange(facturas.Select(i => new ClientActivityItemDto(
                i.Id, "Factura",
                $"Factura {i.InvoiceNumber ?? i.Id.ToString()[..8]} — {i.Status} Bs. {i.Amount:F2}",
                "Sistema",
                i.IssuedAt,
                i.Id.ToString(), null)));
        }

        if (tipoFilter is null or "Ticket")
        {
            var tickets = await _ticketRepo.GetForClientBetweenAsync(clientId, desde, hasta);

            items.AddRange(tickets.Select(t => new ClientActivityItemDto(
                t.Id, "Ticket",
                $"Ticket {t.TicketNumber ?? t.Id.ToString()[..8]} — {t.Status} ({t.Priority}): {(t.Description?.Length > 60 ? t.Description[..60] + "…" : t.Description)}",
                t.CreatedBy?.FullName ?? "Sistema",
                t.CreatedAt,
                t.Id.ToString(), null)));
        }

        if (tipoFilter is null or "Notif")
        {
            var notifs = await _notifRepo.GetForClientBetweenAsync(clientId, desde, hasta);

            items.AddRange(notifs.Select(n => new ClientActivityItemDto(
                n.Id, "Notif",
                $"WhatsApp {n.Tipo}: {n.Estado}",
                "Sistema",
                n.RegistradoAt,
                n.OutboxId.ToString(), null)));
        }

        if (tipoFilter is null or "Admin" or "Estado")
        {
            var auditItems = await _auditRepo.GetForEntityBetweenAsync(clientId, desde, hasta);

            items.AddRange(auditItems.Select(a => new ClientActivityItemDto(
                a.Id, a.Action.StartsWith("CLIENT_STATUS") ? "Estado" : "Admin",
                a.Description != string.Empty ? a.Description : a.Action,
                a.UserName ?? "Sistema",
                a.CreatedAt,
                a.Id.ToString(), a.NewData)));
        }

        if (tipoFilter is null or "CambioPlan")
        {
            var cambios = await _planChangeRepo.GetForClientBetweenAsync(clientId, desde, hasta);

            items.AddRange(cambios.Select(r =>
            {
                var planViejo  = r.OldPlan?.Name ?? r.OldPlanId.ToString()[..8];
                var planNuevo  = r.NewPlan?.Name ?? r.NewPlanId.ToString()[..8];
                // Se usa el nombre del propio estado: el mapeo manual convertía en "Pendiente"
                // cualquier estado que no fuera Aprobado/Rechazado — al añadirse "Aplicado"
                // (cambios diferidos ya ejecutados) el historial habría mentido.
                var statusText = r.Status.ToString();
                var desc = $"Cambio de plan: {planViejo} → {planNuevo} ({statusText})";
                if (r.RejectionReason is not null)
                    desc += $" — Motivo: {r.RejectionReason}";
                return new ClientActivityItemDto(
                    r.Id, "CambioPlan", desc,
                    "Sistema",
                    r.RequestedAt,
                    r.Id.ToString(), null);
            }));
        }

        if (tipoFilter is null or "Adjunto")
        {
            var adjuntos = await _attachRepo.GetForClientBetweenAsync(clientId, desde, hasta);

            items.AddRange(adjuntos.Select(a => new ClientActivityItemDto(
                a.Id, "Adjunto",
                $"Documento adjunto: {a.FileName} ({a.TipoDoc})",
                a.SubidoPor?.FullName ?? "Sistema",
                a.SubidoAt,
                a.Id.ToString(), null)));
        }


        var total   = items.Count;
        var paged   = items
            .OrderByDescending(i => i.OcurridoAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToList();

        return new ClientHistoryDto(paged, total, page, pageSize);
    }
}
