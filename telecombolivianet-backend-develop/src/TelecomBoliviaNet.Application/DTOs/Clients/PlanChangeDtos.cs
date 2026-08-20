namespace TelecomBoliviaNet.Application.DTOs.Clients;


public record PlanChangeItemDto(
    Guid    Id,
    string  ClienteTbn,
    string  ClienteNombre,
    string  PlanAnterior,
    string  PlanNuevo,
    string  FechaEfectiva,
    string? Notes,
    string  SolicitadoAt
);


public record RequestChangeDto(
    Guid    NewPlanId,
    string? Notes
);

public record RejectChangeDto(
    string Motivo
);

public record PlanChangeHistoryDto(
    Guid    Id,
    string  PlanAnterior,
    string  PlanNuevo,
    string  Status,
    string  FechaEfectiva,
    bool    MidMonthChange,
    string  SolicitadoAt,
    string? ProcesadoAt,
    string? MotivoRechazo,
    string? Notes
);
