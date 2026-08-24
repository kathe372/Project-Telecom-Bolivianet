using TelecomBoliviaNet.Application.DTOs.Tickets;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Interfaces;

/// <summary>
/// Horario comercial y feriados: define qué días y horas cuentan para el SLA y
/// para la oferta de slots de instalación y visita.
/// </summary>
public interface IBusinessScheduleService
{
    Task<IReadOnlyList<BusinessScheduleDto>> GetAllAsync();
    Task<BusinessScheduleDto?>               GetByIdAsync(Guid id);
    Task<Result<BusinessScheduleDto>>        CreateAsync(CreateBusinessScheduleDto dto);
    Task<Result<BusinessScheduleDto>>        UpdateAsync(Guid id, UpdateBusinessScheduleDto dto);
    Task<Result<ScheduleHolidayDto>>         AddHolidayAsync(Guid scheduleId, CreateHolidayDto dto);
    Task<Result>                             DeleteHolidayAsync(Guid scheduleId, Guid holidayId);
}
