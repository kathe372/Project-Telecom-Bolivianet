using TelecomBoliviaNet.Application.DTOs.Tickets;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Services;
using TelecomBoliviaNet.Domain.Primitives;

using TelecomBoliviaNet.Application.Interfaces;

namespace TelecomBoliviaNet.Application.Services.Tickets;

public class BusinessScheduleService : IBusinessScheduleService
{
    private readonly IScheduleRepository _scheduleRepo;
    private readonly IGenericRepository<ScheduleHoliday> _holidayRepo;


    public BusinessScheduleService(
        IScheduleRepository scheduleRepo,
        IGenericRepository<ScheduleHoliday>  holidayRepo)
    {
        _scheduleRepo = scheduleRepo;
        _holidayRepo  = holidayRepo;
    }


    public async Task<IReadOnlyList<BusinessScheduleDto>> GetAllAsync()
    {
        var schedules = await _scheduleRepo.GetAllWithHolidaysAsync();

        return schedules.Select(ToDto).ToList();
    }

    public async Task<BusinessScheduleDto?> GetByIdAsync(Guid id)
    {
        var s = await _scheduleRepo.GetWithHolidaysAsync(id);
        return s is null ? null : ToDto(s);
    }


    public async Task<Result<BusinessScheduleDto>> CreateAsync(CreateBusinessScheduleDto dto)
    {
        var validation = ValidateDto(dto.StartHour, dto.EndHour, dto.WorkingDaysMask, dto.Is24x7);
        if (validation is not null) return Result<BusinessScheduleDto>.Failure(validation);

        var exists = await _scheduleRepo.AnyAsync(s => s.Name == dto.Name.Trim());
        if (exists) return Result<BusinessScheduleDto>.Failure("Ya existe un horario con ese nombre.");

        if (dto.IsDefault)
            await ClearDefaultFlagAsync();

        var schedule = new BusinessSchedule
        {
            Name            = dto.Name.Trim(),
            TimeZoneName    = dto.TimeZoneName.Trim(),
            UtcOffsetHours  = dto.UtcOffsetHours,
            WorkingDaysMask = dto.WorkingDaysMask,
            StartHour       = dto.StartHour,
            EndHour         = dto.EndHour,
            Is24x7          = dto.Is24x7,
            IsDefault       = dto.IsDefault,
            IsActive        = true,
            CreatedAt       = DateTime.UtcNow,
        };

        await _scheduleRepo.AddAsync(schedule);
        await _scheduleRepo.SaveChangesAsync();

        return Result<BusinessScheduleDto>.Success(ToDto(schedule));
    }


    public async Task<Result<BusinessScheduleDto>> UpdateAsync(Guid id, UpdateBusinessScheduleDto dto)
    {
        var schedule = await _scheduleRepo.GetWithHolidaysAsync(id);

        if (schedule is null) return Result<BusinessScheduleDto>.Failure("Horario no encontrado.");

        if (dto.Name is not null)
        {
            var taken = await _scheduleRepo.AnyAsync(s => s.Name == dto.Name.Trim() && s.Id != id);
            if (taken) return Result<BusinessScheduleDto>.Failure("Ya existe un horario con ese nombre.");
            schedule.Name = dto.Name.Trim();
        }

        if (dto.TimeZoneName is not null) schedule.TimeZoneName    = dto.TimeZoneName.Trim();
        if (dto.UtcOffsetHours.HasValue)  schedule.UtcOffsetHours  = dto.UtcOffsetHours.Value;
        if (dto.WorkingDaysMask.HasValue) schedule.WorkingDaysMask = dto.WorkingDaysMask.Value;
        if (dto.StartHour.HasValue)       schedule.StartHour        = dto.StartHour.Value;
        if (dto.EndHour.HasValue)         schedule.EndHour          = dto.EndHour.Value;
        if (dto.Is24x7.HasValue)          schedule.Is24x7           = dto.Is24x7.Value;
        if (dto.IsActive.HasValue)        schedule.IsActive         = dto.IsActive.Value;

        if (dto.IsDefault == true && !schedule.IsDefault)
        {
            await ClearDefaultFlagAsync();
            schedule.IsDefault = true;
        }

        var startH = dto.StartHour ?? schedule.StartHour;
        var endH   = dto.EndHour   ?? schedule.EndHour;
        var mask   = dto.WorkingDaysMask ?? schedule.WorkingDaysMask;
        var is24   = dto.Is24x7 ?? schedule.Is24x7;

        var validation = ValidateDto(startH, endH, mask, is24);
        if (validation is not null) return Result<BusinessScheduleDto>.Failure(validation);

        schedule.UpdatedAt = DateTime.UtcNow;
        _scheduleRepo.Update(schedule);
        await _scheduleRepo.SaveChangesAsync();
        await _scheduleRepo.SaveChangesAsync();

        return Result<BusinessScheduleDto>.Success(ToDto(schedule));
    }


    public async Task<Result<ScheduleHolidayDto>> AddHolidayAsync(Guid scheduleId, CreateHolidayDto dto)
    {
        var scheduleExists = await _scheduleRepo.AnyAsync(s => s.Id == scheduleId);
        if (!scheduleExists) return Result<ScheduleHolidayDto>.Failure("Horario no encontrado.");

        if (!DateOnly.TryParseExact(dto.Date, "yyyy-MM-dd", out var date))
            return Result<ScheduleHolidayDto>.Failure("Formato de fecha inválido. Use yyyy-MM-dd.");

        var dup = await _holidayRepo.AnyAsync(h => h.BusinessScheduleId == scheduleId && h.Date == date);
        if (dup) return Result<ScheduleHolidayDto>.Failure("Ya existe un feriado para esa fecha en este horario.");

        var holiday = new ScheduleHoliday
        {
            BusinessScheduleId = scheduleId,
            Date               = date,
            Name               = dto.Name.Trim(),
        };

        await _holidayRepo.AddAsync(holiday);
        await _holidayRepo.SaveChangesAsync();

        return Result<ScheduleHolidayDto>.Success(new ScheduleHolidayDto(
            holiday.Id, holiday.Date.ToString("yyyy-MM-dd"), holiday.Name));
    }

    public async Task<Result> DeleteHolidayAsync(Guid scheduleId, Guid holidayId)
    {
        var holiday = await _holidayRepo.FirstOrDefaultAsync(
            h => h.Id == holidayId && h.BusinessScheduleId == scheduleId);
        if (holiday is null) return Result.Failure("Feriado no encontrado.");

        // La entidad ya está cargada arriba: se borra esa instancia en vez de
        // volver a buscarla por Id, que es lo que hacía DeleteAsync.
        _holidayRepo.Remove(holiday);
        await _holidayRepo.SaveChangesAsync();
        return Result.Success();
    }


    private async Task ClearDefaultFlagAsync()
    {
        var current = await _scheduleRepo.GetDefaultsAsync();
        if (current.Count == 0) return;

        foreach (var s in current) s.IsDefault = false;
        _scheduleRepo.UpdateRange(current);
        await _scheduleRepo.SaveChangesAsync();
    }

    private static string? ValidateDto(int startHour, int endHour, int mask, bool is24x7)
    {
        if (!is24x7)
        {
            if (startHour < 0 || startHour > 23) return "HoraInicio debe ser entre 0 y 23.";
            if (endHour   < 1 || endHour   > 24) return "HoraFin debe ser entre 1 y 24.";
            if (startHour >= endHour)             return "HoraInicio debe ser menor que HoraFin.";
            if (!WorkingDays.IsValid(mask))       return "WorkingDaysMask inválido (1-127).";
        }
        return null;
    }

    private static BusinessScheduleDto ToDto(BusinessSchedule s) => new(
        s.Id,
        s.Name,
        s.TimeZoneName,
        s.UtcOffsetHours,
        s.WorkingDaysMask,
        WorkingDays.Names(s.WorkingDaysMask),
        s.StartHour,
        s.EndHour,
        s.Is24x7,
        s.IsDefault,
        s.IsActive,
        s.CreatedAt,
        s.Holidays
            .OrderBy(h => h.Date)
            .Select(h => new ScheduleHolidayDto(h.Id, h.Date.ToString("yyyy-MM-dd"), h.Name))
            .ToList()
    );

}
