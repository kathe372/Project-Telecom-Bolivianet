using TelecomBoliviaNet.Application.DTOs.Clients;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Interfaces;

public interface IPlanChangeService
{
    Task<List<PlanChangeItemDto>>      GetPendingAsync(Guid? clientId = null);
    Task<List<PlanChangeHistoryDto>> GetHistorialAsync(Guid clientId);
    Task<Result<Guid>>                 RequestChangeAsync(
        Guid clientId, Guid newPlanId, string? notes, Guid actorId, string actorName, string ip);
    Task<Result<bool>>                 ApproveChangeAsync(
        Guid cambioId, bool midMonth, Guid actorId, string actorName, string ip);
    Task<Result<bool>>                 RejectChangeAsync(
        Guid cambioId, string motivo, Guid actorId, string actorName, string ip);
}
