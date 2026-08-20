namespace TelecomBoliviaNet.Application.Options;

public class BusinessHoursOptions
{
    public const string Section = "BusinessHours";

    public int StartHour { get; set; } = 8;

    public int EndHour { get; set; } = 18;

    public int UtcOffsetHours { get; set; } = -4;
}
