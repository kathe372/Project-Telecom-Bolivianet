using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.DTOs.Admin;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Admin;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Services.Admin;

/// <summary>
/// Lee y guarda el perfil de la empresa como un único JSON en <c>SystemConfig</c>,
/// igual que <c>BotConfigService</c>. Sin migración: la tabla ya existe.
/// </summary>
public class CompanyProfileService : ICompanyProfileService
{
    private readonly IGenericRepository<SystemConfig> _sysRepo;
    private readonly AuditService                     _audit;
    private readonly ILogger<CompanyProfileService>   _logger;

    private static readonly CompanyProfileDto _default = new(
        Name:         "TelecomBoliviaNet",
        LegalName:    "TelecomBoliviaNet S.R.L.",
        Nit:          null,
        Address:      null,
        City:         "Cochabamba, Bolivia",
        Phone:        null,
        Email:        null,
        Website:      null,
        Tagline:      "Proveedor de Servicios de Internet",
        LogoBase64:   null,
        PrimaryColor: "#1D4ED8",
        FooterLegal:  "Documento generado automáticamente por el sistema. Uso interno — confidencial."
    );

    public CompanyProfileService(
        IGenericRepository<SystemConfig> sysRepo,
        AuditService                     audit,
        ILogger<CompanyProfileService>   logger)
    {
        _sysRepo = sysRepo;
        _audit   = audit;
        _logger  = logger;
    }

    public async Task<CompanyProfileDto> GetAsync()
    {
        var cfg = await _sysRepo.GetAll()
            .FirstOrDefaultAsync(c => c.Key == SystemConfigKeys.CompanyProfile);

        if (cfg is null || string.IsNullOrWhiteSpace(cfg.Value))
            return _default;

        try
        {
            var parsed = JsonSerializer.Deserialize<CompanyProfileDto>(cfg.Value);
            if (parsed is null) return _default;

            // Un perfil a medio llenar no debe dejar el membrete en blanco: los dos
            // campos que siempre se pintan caen al valor por defecto si vienen vacíos.
            return parsed with
            {
                Name         = string.IsNullOrWhiteSpace(parsed.Name)         ? _default.Name         : parsed.Name,
                PrimaryColor = string.IsNullOrWhiteSpace(parsed.PrimaryColor) ? _default.PrimaryColor : parsed.PrimaryColor,
            };
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex,
                "Perfil de empresa almacenado (key {ConfigKey}) no se pudo deserializar — " +
                "se usan los valores por defecto.", SystemConfigKeys.CompanyProfile);
            return _default;
        }
    }

    public async Task<CompanyProfileDto> UpdateAsync(
        CompanyProfileDto dto, Guid actorId, string actorName, string ip)
    {
        var cfg = await _sysRepo.GetAll()
            .FirstOrDefaultAsync(c => c.Key == SystemConfigKeys.CompanyProfile);

        var json    = JsonSerializer.Serialize(dto);
        var prevVal = cfg?.Value ?? "(default)";

        if (cfg is null)
        {
            await _sysRepo.AddAsync(new SystemConfig
            {
                Key         = SystemConfigKeys.CompanyProfile,
                Value       = json,
                Description = "Datos de la empresa para membretes de reportes exportados",
                UpdatedById = actorId,
            });
            await _sysRepo.SaveChangesAsync();
        }
        else
        {
            cfg.Value       = json;
            cfg.UpdatedAt   = DateTime.UtcNow;
            cfg.UpdatedById = actorId;
            _sysRepo.Update(cfg);
            await _sysRepo.SaveChangesAsync();
        }

        // El logo en base64 hincha el log de auditoría sin aportar nada legible.
        var auditable = dto with { LogoBase64 = dto.LogoBase64 is null ? null : "(logo)" };

        await _audit.LogAsync("Configuración", "COMPANY_PROFILE_UPDATED",
            "Datos de la empresa actualizados",
            userId: actorId, userName: actorName, ip: ip,
            prevData: prevVal.Length > 2000 ? "(perfil anterior)" : prevVal,
            newData: JsonSerializer.Serialize(auditable));

        return dto;
    }

    public CompanyProfileDto GetDefault() => _default;
}
