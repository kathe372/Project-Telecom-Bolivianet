namespace TelecomBoliviaNet.Domain.Services;

public interface ISlotCalculatorService
{
    /// <summary>
    /// Capacidad comprometida (en técnicos) dentro de la franja indicada:
    /// por cada instalación activa solapada cuenta
    /// max(técnicos asignados, TecnicosRequeridos del plan, 1) — una
    /// instalación aún sin técnico asignado también compromete capacidad —
    /// más los técnicos con visitas de soporte programadas en la franja.
    /// </summary>
    Task<int> GetCommittedCapacityAsync(
        DateOnly          fecha,
        TimeOnly          horaInicio,
        TimeOnly          horaFin,
        Guid?             excludeInstallationId = null,
        CancellationToken ct = default);
}
