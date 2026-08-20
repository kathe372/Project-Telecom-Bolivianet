namespace TelecomBoliviaNet.Application.DTOs.Tickets;


public record BusinessScheduleDto(
    Guid     Id,
    string   Name,
    string   TimeZoneName,
    int      UtcOffsetHours,
    int      WorkingDaysMask,
    string[] WorkingDaysDisplay,
    int      StartHour,
    int      EndHour,
    bool     Is24x7,
    bool     IsDefault,
    bool     IsActive,
    DateTime CreatedAt,
    IReadOnlyList<ScheduleHolidayDto> Holidays
);

public record ScheduleHolidayDto(
    Guid   Id,
    string Date,
    string Name
);


public record CreateBusinessScheduleDto(
    string  Name,
    string  TimeZoneName,
    int     UtcOffsetHours,
    int     WorkingDaysMask,
    int     StartHour,
    int     EndHour,
    bool    Is24x7,
    bool    IsDefault
);

public record UpdateBusinessScheduleDto(
    string? Name,
    string? TimeZoneName,
    int?    UtcOffsetHours,
    int?    WorkingDaysMask,
    int?    StartHour,
    int?    EndHour,
    bool?   Is24x7,
    bool?   IsDefault,
    bool?   IsActive
);

public record CreateHolidayDto(
    string Date,
    string Name
);
