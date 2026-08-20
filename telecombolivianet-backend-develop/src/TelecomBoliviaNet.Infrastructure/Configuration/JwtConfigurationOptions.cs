using Microsoft.Extensions.Configuration;
using TelecomBoliviaNet.Application.Interfaces.Auth;

namespace TelecomBoliviaNet.Infrastructure.Configuration;

public class JwtConfigurationOptions : IJwtConfiguration
{
    private readonly IConfiguration _config;

    public JwtConfigurationOptions(IConfiguration config)
    {
        _config = config;
    }

    public string Key =>
        _config["Jwt:Key"] ?? throw new InvalidOperationException("Jwt:Key no configurado.");

    public string Issuer =>
        _config["Jwt:Issuer"] ?? "TelecomBoliviaNet";

    public string Audience =>
        _config["Jwt:Audience"] ?? "TelecomBoliviaNet_Client";

    public int ExpirationHours =>
        int.TryParse(_config["Jwt:ExpirationHours"], out var h) ? h : 8;

    public int RefreshTokenExpDays =>
        int.TryParse(_config["Jwt:RefreshTokenExpirationDays"], out var d) ? d : 30;
}
