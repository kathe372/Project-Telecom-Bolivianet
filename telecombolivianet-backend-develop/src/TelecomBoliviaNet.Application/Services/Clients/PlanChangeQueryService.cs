using TelecomBoliviaNet.Application.DTOs.Clients;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Application.Constants;

namespace TelecomBoliviaNet.Application.Services.Clients;

/// <summary>
/// Las dos lecturas de cambios de plan: la bandeja de pendientes y el historial
/// de un cliente. Extraídas de <c>PlanChangeService</c> (F5), que las tenía junto
/// a las operaciones y arrastraba doce dependencias para resolverlas con una.
/// </summary>
public class PlanChangeQueryService : IPlanChangeQueryService
{
    private readonly IPlanChangeRequestRepository _changeRepo;

    public PlanChangeQueryService(IPlanChangeRequestRepository changeRepo)
        => _changeRepo = changeRepo;

    public async Task<List<PlanChangeItemDto>> GetPendingAsync(Guid? clientId = null)
    {
        var items = await _changeRepo.GetPendingAsync(clientId);

        return items.Select(r => new PlanChangeItemDto(
            r.Id,
            ClienteTbn:    r.Client?.TbnCode  ?? AppConstants.Display.SinDato,
            ClienteNombre: r.Client?.FullName  ?? AppConstants.Display.SinDato,
            PlanAnterior:  r.OldPlan?.Name     ?? AppConstants.Display.SinDato,
            PlanNuevo:     r.NewPlan?.Name      ?? AppConstants.Display.SinDato,
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
            PlanAnterior:   r.OldPlan?.Name ?? AppConstants.Display.SinDato,
            PlanNuevo:      r.NewPlan?.Name  ?? AppConstants.Display.SinDato,
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
