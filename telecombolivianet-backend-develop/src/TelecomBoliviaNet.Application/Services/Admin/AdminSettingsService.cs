using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Admin;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Services.Admin;

public class AdminSettingsService : IAdminSettingsService
{
    private readonly IGenericRepository<SystemConfig> _configRepo;
    private readonly AuditService                     _audit;
    private readonly SecretEncryptionService          _encryption;
    private readonly ILogger<AdminSettingsService>    _logger;

    private static readonly HashSet<string> SecretKeys = new()
    {
        SystemConfigKeys.WhatsAppToken,
        SystemConfigKeys.WhatsAppPhoneNumberId,
    };

    public AdminSettingsService(
        IGenericRepository<SystemConfig> configRepo,
        AuditService                     audit,
        SecretEncryptionService          encryption,
        ILogger<AdminSettingsService>    logger)
    {
        _configRepo = configRepo;
        _audit      = audit;
        _encryption = encryption;
        _logger     = logger;
    }

    public async Task<AdminSettingsDto> GetCurrentAsync()
    {
        var configs = await _configRepo.GetAll().ToListAsync();

        string Get(string key, string def)
        {
            var raw = configs.FirstOrDefault(c => c.Key == key)?.Value ?? def;
            if (!SecretKeys.Contains(key)) return raw;
            try   { return _encryption.Decrypt(raw); }
            catch (Exception ex)
            {
                _logger.LogWarning(ex,
                    "No se pudo desencriptar el secreto {ConfigKey} — se devuelve vacío. " +
                    "Posible clave de cifrado cambiada o valor corrupto.", key);
                return string.Empty;
            }
        }

        return new AdminSettingsDto(
            WhatsAppToken:          Get(SystemConfigKeys.WhatsAppToken,          string.Empty),
            WhatsAppPhoneNumberId:  Get(SystemConfigKeys.WhatsAppPhoneNumberId,  string.Empty),
            WhatsAppApiVersion:     Get(SystemConfigKeys.WhatsAppApiVersion,      "v19.0"),
            SlaHorasAnticipacion:   int.TryParse(Get(SystemConfigKeys.SlaHorasAnticipacion, "4"),  out var h) ? h : 4,
            SlaHoraInicioLaboral:   int.TryParse(Get(SystemConfigKeys.SlaHoraInicioLaboral, "7"),  out var i) ? i : 7,
            SlaHoraFinLaboral:      int.TryParse(Get(SystemConfigKeys.SlaHoraFinLaboral,    "22"), out var f) ? f : 22,
            MaxFailedLoginAttempts: int.TryParse(Get(SystemConfigKeys.MaxFailedLoginAttempts, "5"), out var m) ? m : 5,
            AdminPhoneNumber:       Get(SystemConfigKeys.AdminPhoneNumber, string.Empty),
            AutoSuspendActivo:      Get(SystemConfigKeys.AutoSuspendActivo,     "false") == "true",
            AutoSuspendDiasGracia:  int.TryParse(Get(SystemConfigKeys.AutoSuspendDiasGracia, "10"), out var dg) ? dg : 10
        );
    }

    public async Task<Result<bool>> SaveAsync(
        AdminSettingsDto dto, Guid actorId, string actorName, string ip)
    {
        if (dto.SlaHorasAnticipacion is < 1 or > 24)
            return Result<bool>.Failure("HorasAnticipacion debe estar entre 1 y 24.");
        if (dto.SlaHoraInicioLaboral is < 0 or > 23)
            return Result<bool>.Failure("HoraInicioLaboral debe estar entre 0 y 23.");
        if (dto.SlaHoraFinLaboral is < 1 or > 23)
            return Result<bool>.Failure("HoraFinLaboral debe estar entre 1 y 23.");
        if (dto.SlaHoraInicioLaboral >= dto.SlaHoraFinLaboral)
            return Result<bool>.Failure("HoraInicioLaboral debe ser menor que HoraFinLaboral.");
        if (dto.MaxFailedLoginAttempts is < 3 or > 10)
            return Result<bool>.Failure("MaxFailedLoginAttempts debe estar entre 3 y 10.");

        var updates = new Dictionary<string, string>
        {
            [SystemConfigKeys.WhatsAppToken]         = string.IsNullOrEmpty(dto.WhatsAppToken)
                ? string.Empty : _encryption.Encrypt(dto.WhatsAppToken),
            [SystemConfigKeys.WhatsAppPhoneNumberId] = string.IsNullOrEmpty(dto.WhatsAppPhoneNumberId)
                ? string.Empty : _encryption.Encrypt(dto.WhatsAppPhoneNumberId),
            [SystemConfigKeys.WhatsAppApiVersion]     = dto.WhatsAppApiVersion,
            [SystemConfigKeys.SlaHorasAnticipacion]   = dto.SlaHorasAnticipacion.ToString(),
            [SystemConfigKeys.SlaHoraInicioLaboral]   = dto.SlaHoraInicioLaboral.ToString(),
            [SystemConfigKeys.SlaHoraFinLaboral]      = dto.SlaHoraFinLaboral.ToString(),
            [SystemConfigKeys.MaxFailedLoginAttempts] = dto.MaxFailedLoginAttempts.ToString(),
            [SystemConfigKeys.AdminPhoneNumber]       = dto.AdminPhoneNumber ?? string.Empty,
            [SystemConfigKeys.AutoSuspendActivo]      = dto.AutoSuspendActivo ? "true" : "false",
            [SystemConfigKeys.AutoSuspendDiasGracia]  = dto.AutoSuspendDiasGracia.ToString(),
        };

        var existing = await _configRepo.GetAll().ToListAsync();

        // D-13 — Se guarda UNA vez, no una por ajuste.
        //
        // El SaveChangesAsync estaba dentro del bucle, así que un fallo al
        // guardar el sexto de los diez ajustes dejaba cinco aplicados y cinco
        // no: la pantalla reportaba error y la configuración quedaba a medias.
        // Y son ajustes que se leen juntos —el horario laboral del SLA son tres
        // valores que solo tienen sentido entre sí—.
        //
        // No hace falta una transacción: todos los repositorios comparten el
        // mismo DbContext, así que un único guardado los persiste todos o
        // ninguno.
        foreach (var (key, value) in updates)
        {
            var record = existing.FirstOrDefault(c => c.Key == key);
            if (record is not null)
            {
                record.Value       = value;
                record.UpdatedAt   = DateTime.UtcNow;
                record.UpdatedById = actorId;
                _configRepo.Update(record);
            }
            else
            {
                await _configRepo.AddAsync(new SystemConfig
                {
                    Key         = key,
                    Value       = value,
                    IsSecret    = SecretKeys.Contains(key),
                    UpdatedAt   = DateTime.UtcNow,
                    UpdatedById = actorId,
                });
            }
        }

        await _configRepo.SaveChangesAsync();

        await _audit.LogAsync("Sistema", "SETTINGS_UPDATED",
            "Configuracion del sistema actualizada via BD",
            userId: actorId, userName: actorName, ip: ip,
            newData: System.Text.Json.JsonSerializer.Serialize(new
            {
                dto.WhatsAppPhoneNumberId,
                dto.WhatsAppApiVersion,
                dto.SlaHorasAnticipacion,
                dto.SlaHoraInicioLaboral,
                dto.SlaHoraFinLaboral,
                dto.MaxFailedLoginAttempts,
                WhatsAppToken = dto.WhatsAppToken.Length > 0 ? "***" : "(vacio)"
            }));

        return Result<bool>.Success(true);
    }
}

public record AdminSettingsDto(
    string  WhatsAppToken,
    string  WhatsAppPhoneNumberId,
    string  WhatsAppApiVersion,
    int     SlaHorasAnticipacion,
    int     SlaHoraInicioLaboral,
    int     SlaHoraFinLaboral,
    int     MaxFailedLoginAttempts,
    string? AdminPhoneNumber      = null,
    bool    AutoSuspendActivo     = false,
    int     AutoSuspendDiasGracia = 10
);
