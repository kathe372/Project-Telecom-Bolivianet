using TelecomBoliviaNet.Application.DTOs.Plans;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Interfaces;

/// <summary>
/// Catálogo de planes: consulta, alta, edición e historial de cambios de precio.
/// </summary>
public interface IPlanService
{
    Task<IEnumerable<PlanDto>>  GetAllAsync(bool onlyActive = false);
    Task<PlanDto?>              GetByIdAsync(Guid id);
    Task<Result<PlanDto>>       CreateAsync(CreatePlanDto dto, Guid adminId, string adminName, string ip);
    Task<Result<PlanDto>>       UpdateAsync(Guid id, UpdatePlanDto dto, Guid adminId, string adminName, string ip);
    Task<List<PlanHistoryDto>>  GetHistoryAsync(Guid planId);
}
