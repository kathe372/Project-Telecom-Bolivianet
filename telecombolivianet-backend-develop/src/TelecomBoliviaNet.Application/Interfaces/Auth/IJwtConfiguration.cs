namespace TelecomBoliviaNet.Application.Interfaces.Auth;

public interface IJwtConfiguration
{
    string Key                 { get; }
    string Issuer              { get; }
    string Audience            { get; }
    int    ExpirationHours     { get; }
    int    RefreshTokenExpDays { get; }
}
