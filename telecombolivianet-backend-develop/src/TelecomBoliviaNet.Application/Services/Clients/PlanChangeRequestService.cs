using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Application.Services.Tickets;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Services.Clients;

/// <summary>
/// Pedir un cambio de plan: valida que proceda, abre el ticket de seguimiento,
/// deja la solicitud pendiente y avisa a Administración.
///
/// <para>Extraído de <c>PlanChangeService</c> (F5). Pedir y resolver son dos
/// momentos distintos, con actores distintos —el operador que atiende al cliente
/// y el admin que aprueba— y no comparten ni una línea de código.</para>
/// </summary>
public class PlanChangeRequestService : IPlanChangeRequestService
{
    private readonly IPlanChangeRequestRepository _changeRepo;
    private readonly IClientRepository            _clientRepo;
    private readonly IGenericRepository<Plan>     _planRepo;
    private readonly ITicketRepository            _ticketRepo;
    private readonly AuditService                 _audit;
    private readonly IUnitOfWork                  _uow;
    private readonly IInternalAlertService        _alertSvc;
    private readonly TicketNumberService          _ticketNumSvc;

    public PlanChangeRequestService(
        IPlanChangeRequestRepository changeRepo,
        IClientRepository            clientRepo,
        IGenericRepository<Plan>     planRepo,
        ITicketRepository            ticketRepo,
        AuditService                 audit,
        IUnitOfWork                  uow,
        IInternalAlertService        alertSvc,
        TicketNumberService          ticketNumSvc)
    {
        _changeRepo   = changeRepo;
        _clientRepo   = clientRepo;
        _planRepo     = planRepo;
        _ticketRepo   = ticketRepo;
        _audit        = audit;
        _uow          = uow;
        _alertSvc     = alertSvc;
        _ticketNumSvc = ticketNumSvc;
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
}
