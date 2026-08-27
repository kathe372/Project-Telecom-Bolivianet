using TelecomBoliviaNet.Application.DTOs.Clients;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Interfaces;

/// <summary>
/// Resolver una solicitud de cambio de plan. Pedirla está en
/// <see cref="IPlanChangeRequestService"/> y las lecturas en
/// <see cref="IPlanChangeQueryService"/>.
/// </summary>
public interface IPlanChangeService
{
    Task<Result<bool>> ApproveChangeAsync(
        Guid cambioId, bool midMonth, Guid actorId, string actorName, string ip);

    Task<Result<bool>> RejectChangeAsync(
        Guid cambioId, string motivo, Guid actorId, string actorName, string ip);
}

/// <summary>Pedir un cambio de plan.</summary>
public interface IPlanChangeRequestService
{
    Task<Result<Guid>> RequestChangeAsync(
        Guid clientId, Guid newPlanId, string? notes, Guid actorId, string actorName, string ip);
}

/// <summary>Bandeja de pendientes e historial por cliente.</summary>
public interface IPlanChangeQueryService
{
    Task<List<PlanChangeItemDto>> GetPendingAsync(Guid? clientId = null);

    Task<List<PlanChangeHistoryDto>> GetHistorialAsync(Guid clientId);
}
