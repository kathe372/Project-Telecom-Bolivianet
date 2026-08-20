using TelecomBoliviaNet.Application.Services.Admin;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Interfaces;

/// <summary>
/// Ajustes del sistema que viven en <c>SystemConfigs</c> (credenciales de
/// WhatsApp, ventana laboral del SLA, intentos de login).
/// </summary>
public interface IAdminSettingsService
{
    Task<AdminSettingsDto> GetCurrentAsync();
    Task<Result<bool>>     SaveAsync(AdminSettingsDto dto, Guid actorId, string actorName, string ip);
}
