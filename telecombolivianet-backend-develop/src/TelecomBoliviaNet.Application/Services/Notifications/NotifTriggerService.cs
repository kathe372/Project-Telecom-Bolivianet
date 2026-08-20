#pragma warning disable CS8981
using r = TelecomBoliviaNet.Domain.Primitives.Result;
#pragma warning restore CS8981
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using TelecomBoliviaNet.Application.DTOs.Notifications;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Notifications;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Services.Notifications;

public class NotifTriggerService
{
    private readonly IGenericRepository<NotifConfig> _repo;
    private readonly AuditService                    _audit;

    public NotifTriggerService(
        IGenericRepository<NotifConfig> repo,
        AuditService                   audit)
    {
        _repo  = repo;
        _audit = audit;
    }

    public async Task<NotifConfigListDto> GetConfigsAsync()
    {
        var configs   = await _repo.GetAll().AsNoTracking().OrderBy(c => c.Tipo).ToListAsync();
        var horaLocal = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, NotifShared.BoliviaZone).ToString("HH:mm");
        return new NotifConfigListDto(configs.Select(NotifShared.ToConfigDto).ToList(), horaLocal);
    }

    public async Task<Result> UpdateConfigsAsync(
        UpdateNotifConfigsDto dto, Guid actorId, string actorName, string ip)
    {
        var tipos        = dto.Configs.Select(c => c.Tipo).ToList();
        var allConfigs   = await _repo.GetAll()
            .Where(c => tipos.Contains(c.Tipo))
            .ToListAsync();
        var configByTipo = allConfigs.ToDictionary(c => c.Tipo);

        var now             = DateTime.UtcNow;
        var configsToUpdate = new List<NotifConfig>();
        var auditEntries    = new List<(NotifType Tipo, string Prev, string New)>();

        foreach (var upd in dto.Configs)
        {
            if (!configByTipo.TryGetValue(upd.Tipo, out var config)) continue;

            var prev = JsonSerializer.Serialize(NotifShared.ToConfigDto(config));

            config.Activo           = upd.Activo;
            config.DelaySegundos    = upd.DelaySegundos;
            config.HoraInicio       = TimeOnly.Parse(upd.HoraInicio);
            config.HoraFin          = TimeOnly.Parse(upd.HoraFin);
            config.Inmediato        = upd.Inmediato;
            config.DiasAntes        = upd.DiasAntes;
            config.PlantillaId      = upd.PlantillaId;
            config.ActualizadoAt    = now;
            config.ActualizadoPorId = actorId;
            configsToUpdate.Add(config);

            auditEntries.Add((upd.Tipo, prev, JsonSerializer.Serialize(upd)));
        }

        if (configsToUpdate.Count > 0)
            await _repo.UpdateRangeAsync(configsToUpdate);

        // SECUENCIAL, no Task.WhenAll: AuditService.LogAsync escribe sobre el DbContext scoped
        // que comparten todos los repositorios. Lanzarlos en paralelo provocaba "A second
        // operation was started on this context"; como LogAsync se traga sus propios errores,
        // el efecto real era que las entradas de auditoría desaparecían en silencio —
        // justamente en la pantalla desde la que se pueden apagar los avisos a clientes.
        foreach (var (tipo, prev, actualizado) in auditEntries)
        {
            await _audit.LogAsync("Notificaciones", "NOTIF_CONFIG_UPDATED",
                $"Config actualizada: {tipo}",
                userId: actorId, userName: actorName, ip: ip,
                prevData: prev, newData: actualizado);
        }

        return Result.Success();
    }
}
