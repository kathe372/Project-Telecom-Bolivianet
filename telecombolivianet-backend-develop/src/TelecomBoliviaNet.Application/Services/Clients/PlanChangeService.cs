// F4: la referencia a EF Core queda por UN motivo, el mismo que en
// UpdateClientCommand — capturar DbUpdateConcurrencyException, el tipo que lanza
// EF cuando el token xmin detecta una modificación concurrente. Ya no queda
// ninguna consulta de EF en este archivo.
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.DTOs.Clients;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Application.Services.Invoices;
using TelecomBoliviaNet.Application.Services.Tickets;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Notifications;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;
using TelecomBoliviaNet.Domain.Services;

namespace TelecomBoliviaNet.Application.Services.Clients;

public class PlanChangeService : IPlanChangeService
{
    private readonly IPlanChangeRequestRepository _changeRepo;
    private readonly IClientRepository             _clientRepo;
    private readonly IGenericRepository<Plan>               _planRepo;
    private readonly ITicketRepository      _ticketRepo;
    private readonly AuditService                           _audit;
    private readonly IUnitOfWork                            _uow;
    private readonly INotifPublisher                        _notif;
    private readonly IChatbotDirectNotifier                 _chatbotNotifier;
    private readonly IInternalAlertService                  _alertSvc;
    private readonly InvoiceProrationService                _proration;
    private readonly ILogger<PlanChangeService>             _logger;
    private readonly TicketNumberService                    _ticketNumSvc;

    public PlanChangeService(
        IPlanChangeRequestRepository changeRepo,
        IClientRepository            clientRepo,
        IGenericRepository<Plan>              planRepo,
        ITicketRepository     ticketRepo,
        AuditService                          audit,
        IUnitOfWork                           uow,
        INotifPublisher                       notif,
        IChatbotDirectNotifier                chatbotNotifier,
        IInternalAlertService                 alertSvc,
        InvoiceProrationService               proration,
        ILogger<PlanChangeService>            logger,
        TicketNumberService                   ticketNumSvc)
    {
        _changeRepo      = changeRepo;
        _clientRepo      = clientRepo;
        _planRepo        = planRepo;
        _ticketRepo      = ticketRepo;
        _audit           = audit;
        _uow             = uow;
        _notif           = notif;
        _chatbotNotifier = chatbotNotifier;
        _alertSvc        = alertSvc;
        _proration       = proration;
        _logger          = logger;
        _ticketNumSvc    = ticketNumSvc;
    }

    public async Task<Result<Guid>> RequestChangeAsync(
        Guid clientId, Guid newPlanId, string? notes,
        Guid actorId, string actorName, string ip)
    {
        var client = await _clientRepo.GetWithPlanAsync(clientId);

        if (client is null)
            return Result<Guid>.Failure("Cliente no encontrado.");
        if (client.PlanId == newPlanId)
            return Result<Guid>.Failure("El cliente ya tiene ese plan.");

        var newPlan = await _planRepo.GetByIdAsync(newPlanId);
        if (newPlan is null || !newPlan.IsActive)
            return Result<Guid>.Failure("El plan seleccionado no existe o está inactivo.");

        var tienePendiente = await _changeRepo.AnyAsync(r =>
            r.ClientId == clientId && r.Status == PlanChangeStatus.Pendiente);
        if (tienePendiente)
            return Result<Guid>.Failure("El cliente ya tiene una solicitud de cambio de plan pendiente.");

        var hoy           = DateTime.UtcNow;
        var effectiveDate = new DateTime(hoy.Year, hoy.Month, 1, 0, 0, 0, DateTimeKind.Utc)
                                .AddMonths(1);

        var ticket = new SupportTicket
        {
            TicketNumber    = await _ticketNumSvc.NextAsync(),
            ClientId        = clientId,
            Subject         = $"[Cambio de Plan] {client.TbnCode} – {client.FullName} → {newPlan.Name}",
            Type            = TicketType.CambioPlan,
            Priority        = TicketPriority.Baja,
            Status          = TicketStatus.Abierto,
            Origin          = TicketOrigin.Manual,
            Description     = $"Solicitud de cambio de plan:\n" +
                              $"Plan actual: {client.Plan?.Name ?? "—"}\n" +
                              $"Plan nuevo:  {newPlan.Name}\n" +
                              $"Fecha efectiva: {effectiveDate:dd/MM/yyyy}\n" +
                              (notes is not null ? $"Notas: {notes}" : ""),
            CreatedByUserId = actorId,
            CreatedAt       = DateTime.UtcNow,
        };

        var cambio = new PlanChangeRequest
        {
            ClientId       = clientId,
            OldPlanId      = client.PlanId,
            NewPlanId      = newPlanId,
            TicketId       = ticket.Id,
            Status         = PlanChangeStatus.Pendiente,
            EffectiveDate  = effectiveDate,
            MidMonthChange = false,
            Notes          = notes,
            RequestedAt    = DateTime.UtcNow,
            RequestedById  = actorId,
        };

        await _uow.BeginTransactionAsync();
        try
        {
            await _ticketRepo.AddAsync(ticket);
            await _changeRepo.AddAsync(cambio);
            await _changeRepo.SaveChangesAsync();
            await _uow.CommitAsync();
        }
        catch (Exception)
        {
            await _uow.RollbackAsync();
            throw;
        }

        await _audit.LogAsync("Clientes", "PLAN_CHANGE_REQUESTED",
            $"Cambio de plan solicitado: {client.TbnCode} — {client.Plan?.Name} → {newPlan.Name}",
            actorId, actorName, ip);

        await _alertSvc.CreateForRoleAsync(
            role:    "Admin",
            type:    "PLAN_CHANGE_PENDIENTE",
            title:   $"Solicitud de cambio de plan — {client.TbnCode}",
            message: $"{client.Plan?.Name} → {newPlan.Name}",
            link:    $"/clients/{clientId}?tab=planchange");

        return Result<Guid>.Success(cambio.Id);
    }

    public async Task<Result<bool>> ApproveChangeAsync(
        Guid cambioId, bool midMonth,
        Guid actorId, string actorName, string ip)
    {
        var cambio = await _changeRepo.GetForCommandAsync(cambioId);

        if (cambio is null)
            return Result<bool>.Failure("Solicitud de cambio no encontrada.");
        if (cambio.Status != PlanChangeStatus.Pendiente)
            return Result<bool>.Failure("Esta solicitud ya fue procesada.");

        var client  = cambio.Client!;
        var newPlan = cambio.NewPlan!;
        var hoy     = DateTime.UtcNow;

        // Política: solo los upgrades pueden aplicarse de inmediato; los downgrades van a fin de mes.
        if (midMonth &&
            !PlanChangePolicy.AllowsImmediate(client.Plan?.MonthlyPrice ?? 0m, newPlan.MonthlyPrice))
            return Result<bool>.Failure(
                "Un cambio a un plan de igual o menor precio se aplica a fin de mes, no de inmediato.");

        var ticket = cambio.TicketId.HasValue
            ? await _ticketRepo.GetByIdIgnoringClientFilterAsync(cambio.TicketId.Value)
            : null;

        await _uow.BeginTransactionAsync();
        try
        {
            if (midMonth)
            {
                cambio.MidMonthChange = true;
                cambio.EffectiveDate  = hoy;
                await _proration.ApplyMidMonthAsync(client, cambio.NewPlan!, hoy);

                // Solo el cambio inmediato toca el plan aquí. Antes ChangePlan se ejecutaba
                // SIEMPRE, también en los diferidos: se aprobaba un downgrade "efectivo el 1ro
                // del mes siguiente" y el cliente perdía la velocidad ese mismo día, habiendo
                // pagado el mes completo del plan superior. Los diferidos los aplica
                // ApplyScheduledPlanChangesJob cuando llega EffectiveDate.
                client.ChangePlan(newPlan.Id);
                _clientRepo.Update(client);
            }

            cambio.Status        = midMonth ? PlanChangeStatus.Aplicado : PlanChangeStatus.Aprobado;
            cambio.ProcessedAt   = hoy;
            cambio.ProcessedById = actorId;
            _changeRepo.Update(cambio);
            if (ticket is not null)
            {
                ticket.Status            = TicketStatus.Resuelto;
                ticket.ResolutionMessage = midMonth
                    ? "Cambio de plan aprobado y ejecutado inmediatamente. Facturas proporcionales generadas."
                    : $"Cambio de plan aprobado. Efectivo el {cambio.EffectiveDate:dd/MM/yyyy}.";
                ticket.ResolvedAt = hoy;
                _ticketRepo.Update(ticket);
            }

            await _changeRepo.SaveChangesAsync();
            await _uow.CommitAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            await _uow.RollbackAsync();
            return Result<bool>.Failure(
                "El cliente fue modificado por otro proceso. Recargue la página e intente nuevamente.");
        }
        catch (Exception)
        {
            await _uow.RollbackAsync();
            throw;
        }

        // Las notificaciones son best-effort: un fallo aquí NO debe revertir un cambio ya confirmado.
        // Solo se avisa "tu plan cambió" cuando REALMENTE cambió. En un cambio diferido el aviso
        // lo manda ApplyScheduledPlanChangesJob al aplicarlo; anunciarlo aquí sería mentirle al
        // cliente durante todo el resto del mes.
        if (midMonth)
            await NotifyApprovalAsync(client, newPlan, midMonth: true);

        await _audit.LogAsync("Clientes", "PLAN_CHANGE_APPROVED",
            $"Cambio de plan aprobado: {client.TbnCode} → {newPlan.Name}" +
            (midMonth ? " (mitad de mes)" : " (fin de mes)"),
            actorId, actorName, ip);

        return Result<bool>.Success(true);
    }

    private async Task NotifyApprovalAsync(Client client, Plan newPlan, bool midMonth)
    {
        try
        {
            if (midMonth && !string.IsNullOrWhiteSpace(client.PhoneMain))
            {
                var sentDirect = await _chatbotNotifier.SendPlanChangeConfirmationAsync(
                    client.PhoneMain, client.FullName, newPlan.Name);
                if (sentDirect) return;
            }

            await _notif.PublishAsync(
                NotifType.CAMBIO_PLAN, client.Id, client.PhoneMain,
                new Dictionary<string, string>
                {
                    ["nombre"]  = client.FullName,
                    ["plan"]    = newPlan.Name,
                    ["empresa"] = "TelecomBoliviaNet",
                });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex,
                "Cambio de plan aprobado pero falló la notificación al cliente {ClientId}", client.Id);
        }
    }

    public async Task<Result<bool>> RejectChangeAsync(
        Guid cambioId, string motivo,
        Guid actorId, string actorName, string ip)
    {
        var cambio = await _changeRepo.GetForCommandAsync(cambioId);

        if (cambio is null)
            return Result<bool>.Failure("Solicitud no encontrada.");
        if (cambio.Status != PlanChangeStatus.Pendiente)
            return Result<bool>.Failure("Esta solicitud ya fue procesada.");

        var ticket = cambio.TicketId.HasValue
            ? await _ticketRepo.GetByIdIgnoringClientFilterAsync(cambio.TicketId.Value)
            : null;

        var ahora = DateTime.UtcNow;
        await _uow.BeginTransactionAsync();
        try
        {
            cambio.Status          = PlanChangeStatus.Rechazado;
            cambio.RejectionReason = motivo;
            cambio.ProcessedAt     = ahora;
            cambio.ProcessedById   = actorId;
            _changeRepo.Update(cambio);
            if (ticket is not null)
            {
                ticket.Status            = TicketStatus.Cerrado;
                ticket.ResolutionMessage = $"Cambio de plan rechazado. Motivo: {motivo}";
                ticket.ClosedAt          = ahora;
                _ticketRepo.Update(ticket);
            }

            await _changeRepo.SaveChangesAsync();
            await _uow.CommitAsync();
        }
        catch (Exception)
        {
            await _uow.RollbackAsync();
            throw;
        }

        if (cambio.Client is not null)
        {
            // Tipo propio para el rechazo: antes se enviaba CAMBIO_PLAN con el
            // plan solicitado, así que el cliente leía "tu plan cambió a X"
            // exactamente cuando se le acababa de denegar ese cambio.
            await _notif.PublishAsync(
                NotifType.CAMBIO_PLAN_RECHAZADO,
                cambio.Client.Id,
                cambio.Client.PhoneMain,
                new Dictionary<string, string>
                {
                    ["nombre"]  = cambio.Client.FullName,
                    ["plan"]    = cambio.NewPlan?.Name ?? "—",
                    ["motivo"]  = motivo,
                    ["empresa"] = "TelecomBoliviaNet",
                });
        }

        await _audit.LogAsync("Clientes", "PLAN_CHANGE_REJECTED",
            $"Cambio de plan rechazado: {cambio.ClientId} — {motivo}",
            actorId, actorName, ip);

        return Result<bool>.Success(true);
    }

    public async Task<List<PlanChangeItemDto>> GetPendingAsync(Guid? clientId = null)
    {
        var items = await _changeRepo.GetPendingAsync(clientId);

        return items.Select(r => new PlanChangeItemDto(
            r.Id,
            ClienteTbn:    r.Client?.TbnCode  ?? "—",
            ClienteNombre: r.Client?.FullName  ?? "—",
            PlanAnterior:  r.OldPlan?.Name     ?? "—",
            PlanNuevo:     r.NewPlan?.Name      ?? "—",
            FechaEfectiva: r.EffectiveDate.ToString("yyyy-MM-dd"),
            Notes:         r.Notes,
            SolicitadoAt:  r.RequestedAt.ToString("O")
        )).ToList();
    }

    public async Task<List<PlanChangeHistoryDto>> GetHistorialAsync(Guid clientId)
    {
        var items = await _changeRepo.GetHistoryForClientAsync(clientId);

        return items.Select(r => new PlanChangeHistoryDto(
            r.Id,
            PlanAnterior:   r.OldPlan?.Name ?? "—",
            PlanNuevo:      r.NewPlan?.Name  ?? "—",
            Status:         r.Status.ToString(),
            FechaEfectiva:  r.EffectiveDate.ToString("yyyy-MM-dd"),
            MidMonthChange: r.MidMonthChange,
            SolicitadoAt:   r.RequestedAt.ToString("O"),
            ProcesadoAt:    r.ProcessedAt?.ToString("O"),
            MotivoRechazo:  r.RejectionReason,
            Notes:          r.Notes
        )).ToList();
    }
}
