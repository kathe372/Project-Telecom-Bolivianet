namespace TelecomBoliviaNet.Application.DTOs.Clients;

public record ClientBotDto(
    string  Id,
    string  TbnCode,
    string  FullName,
    string  PhoneMain,
    string  Status,
    string  PlanId,
    string  PlanName,
    int     PlanSpeedMbps,
    decimal TotalDebt,
    int     PendingMonths,
    string  Zone
);
