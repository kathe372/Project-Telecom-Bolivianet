using TelecomBoliviaNet.Domain.Entities.Audit;
using Microsoft.EntityFrameworkCore;
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
    private readonly IGenericRepository<Payment>           _paymentRepo;
    private readonly IGenericRepository<Invoice>           _invoiceRepo;
    private readonly IGenericRepository<SupportTicket>     _ticketRepo;
    private readonly IGenericRepository<AuditLog>          _auditRepo;
    private readonly IGenericRepository<NotifLog>          _notifRepo;
    private readonly IGenericRepository<ClientAttachment>  _attachRepo;
    private readonly IGenericRepository<PlanChangeRequest> _planChangeRepo;

    public ClientHistoryService(
        IGenericRepository<Payment>            paymentRepo,
        IGenericRepository<Invoice>            invoiceRepo,
        IGenericRepository<SupportTicket>      ticketRepo,
        IGenericRepository<AuditLog>           auditRepo,
        IGenericRepository<NotifLog>           notifRepo,
        IGenericRepository<ClientAttachment>   attachRepo,
        IGenericRepository<PlanChangeRequest>  planChangeRepo)
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
            var pagos = await _paymentRepo.GetAll()
                .AsNoTracking()
                .Include(p => p.RegisteredBy)
                .Where(p => p.ClientId == clientId && !p.IsVoided
                && (!desde.HasValue || p.PaidAt >= desde.Value)
                && (!hasta.HasValue || p.PaidAt <= hasta.Value))
                .ToListAsync();

            items.AddRange(pagos.Select(p => new ClientActivityItemDto(
                p.Id, "Pago",
                $"Pago de Bs. {p.Amount:F2} ({p.Method})",
                p.RegisteredBy?.FullName ?? "Sistema",
                p.PaidAt,
                p.Id.ToString(), null)));
        }

        if (tipoFilter is null or "Factura")
        {
            var facturas = await _invoiceRepo.GetAll()
                .AsNoTracking()
                .Where(i => i.ClientId == clientId
                && (!desde.HasValue || i.IssuedAt >= desde.Value)
                && (!hasta.HasValue || i.IssuedAt <= hasta.Value))
                .ToListAsync();

            items.AddRange(facturas.Select(i => new ClientActivityItemDto(
                i.Id, "Factura",
                $"Factura {i.InvoiceNumber ?? i.Id.ToString()[..8]} — {i.Status} Bs. {i.Amount:F2}",
                "Sistema",
                i.IssuedAt,
                i.Id.ToString(), null)));
        }

        if (tipoFilter is null or "Ticket")
        {
            var tickets = await _ticketRepo.GetAll()
                .AsNoTracking()
                .Include(t => t.CreatedBy)
                .Where(t => t.ClientId == clientId
                && (!desde.HasValue || t.CreatedAt >= desde.Value)
                && (!hasta.HasValue || t.CreatedAt <= hasta.Value))
                .ToListAsync();

            items.AddRange(tickets.Select(t => new ClientActivityItemDto(
                t.Id, "Ticket",
                $"Ticket {t.TicketNumber ?? t.Id.ToString()[..8]} — {t.Status} ({t.Priority}): {(t.Description?.Length > 60 ? t.Description[..60] + "…" : t.Description)}",
                t.CreatedBy?.FullName ?? "Sistema",
                t.CreatedAt,
                t.Id.ToString(), null)));
        }

        if (tipoFilter is null or "Notif")
        {
            var notifs = await _notifRepo.GetAll()
                .AsNoTracking()
                .Where(n => n.ClienteId == clientId
                && (!desde.HasValue || n.RegistradoAt >= desde.Value)
                && (!hasta.HasValue || n.RegistradoAt <= hasta.Value))
                .ToListAsync();

            items.AddRange(notifs.Select(n => new ClientActivityItemDto(
                n.Id, "Notif",
                $"WhatsApp {n.Tipo}: {n.Estado}",
                "Sistema",
                n.RegistradoAt,
                n.OutboxId.ToString(), null)));
        }

        if (tipoFilter is null or "Admin" or "Estado")
        {
            var auditItems = await _auditRepo.GetAll()
                .AsNoTracking()
                .Where(a => a.EntityId == clientId
                && (!desde.HasValue || a.CreatedAt >= desde.Value)
                && (!hasta.HasValue || a.CreatedAt <= hasta.Value))
                .ToListAsync();

            items.AddRange(auditItems.Select(a => new ClientActivityItemDto(
                a.Id, a.Action.StartsWith("CLIENT_STATUS") ? "Estado" : "Admin",
                a.Description != string.Empty ? a.Description : a.Action,
                a.UserName ?? "Sistema",
                a.CreatedAt,
                a.Id.ToString(), a.NewData)));
        }

        if (tipoFilter is null or "CambioPlan")
        {
            var cambios = await _planChangeRepo.GetAll()
                .AsNoTracking()
                .Include(r => r.OldPlan)
                .Include(r => r.NewPlan)
                .Where(r => r.ClientId == clientId
                && (!desde.HasValue || r.RequestedAt >= desde.Value)
                && (!hasta.HasValue || r.RequestedAt <= hasta.Value))
                .ToListAsync();

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
            var adjuntos = await _attachRepo.GetAll()
                .AsNoTracking()
                .Include(a => a.SubidoPor)
                .Where(a => a.ClientId == clientId
                && (!desde.HasValue || a.SubidoAt >= desde.Value)
                && (!hasta.HasValue || a.SubidoAt <= hasta.Value))
                .ToListAsync();

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
