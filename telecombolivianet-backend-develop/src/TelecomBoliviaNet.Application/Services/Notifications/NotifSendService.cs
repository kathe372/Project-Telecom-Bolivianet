#pragma warning disable CS8981
using r = TelecomBoliviaNet.Domain.Primitives.Result;
#pragma warning restore CS8981
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using TelecomBoliviaNet.Application.DTOs.Notifications;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Notifications;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Services.Notifications;

public class NotifSendService
{
    private readonly IGenericRepository<NotifConfig>         _configRepo;
    private readonly IGenericRepository<NotifOutbox>         _outboxRepo;
    private readonly IGenericRepository<NotifLog>            _logRepo;
    private readonly IGenericRepository<Client>              _clientRepo;
    private readonly NotifSegmentService                     _segmentSvc;
    private readonly NotifContextBuilderService              _contextBuilder;
    private readonly AuditService                            _audit;

    private const int AntiSpamWindowHours = 24;

    public NotifSendService(
        IGenericRepository<NotifConfig>  configRepo,
        IGenericRepository<NotifOutbox>  outboxRepo,
        IGenericRepository<NotifLog>     logRepo,
        IGenericRepository<Client>       clientRepo,
        NotifSegmentService              segmentSvc,
        NotifContextBuilderService       contextBuilder,
        AuditService                     audit)
    {
        _configRepo     = configRepo;
        _outboxRepo     = outboxRepo;
        _logRepo        = logRepo;
        _clientRepo     = clientRepo;
        _segmentSvc     = segmentSvc;
        _contextBuilder = contextBuilder;
        _audit          = audit;
    }


    public async Task<Result<BulkSendResultDto>> BulkSendAsync(
        BulkSendDto dto, Guid actorId, string actorName, string ip)
    {
        // Segunda guarda, a propósito: el controlador ya rechaza el tipo ausente,
        // pero este servicio manda WhatsApp a toda la cartera y no debe depender
        // de que quien lo llame se haya acordado de comprobarlo.
        if (dto.Tipo is not { } tipo)
            return Result<BulkSendResultDto>.Failure(
                "Debe indicarse el tipo de notificación a enviar.");

        var config = await _configRepo.GetAll()
            .FirstOrDefaultAsync(c => c.Tipo == tipo);

        if (config is null || !config.Activo)
            return Result<BulkSendResultDto>.Failure(
                $"El tipo {tipo} está desactivado o no existe.");

        var clientes = await LoadTargetClientsAsync(dto);
        if (!clientes.Any())
            return Result<BulkSendResultDto>.Success(new BulkSendResultDto(0, 0, 0));

        var ventana24h   = DateTime.UtcNow.AddHours(-AntiSpamWindowHours);
        var clienteIds   = clientes.Select(c => c.Id).ToList();
        var yaRecibieroList = await _logRepo.GetAll()
            .Where(l => clienteIds.Contains(l.ClienteId)
                     && l.Tipo      == tipo
                     && l.Estado    == NotifLogEstado.ENVIADO
                     && l.RegistradoAt >= ventana24h)
            .Select(l => l.ClienteId)
            .Distinct()
            .ToListAsync();
        var yaRecibieron = new HashSet<Guid>(yaRecibieroList);

        var outboxBatch  = new List<NotifOutbox>();
        var omitidoLogs  = new List<NotifLog>();
        int sinTelefono  = 0;

        var enviarDesde = DateTime.UtcNow.AddSeconds(config.DelaySegundos);

        foreach (var cliente in clientes)
        {
            if (string.IsNullOrWhiteSpace(cliente.PhoneMain))
            {
                sinTelefono++;
                continue;
            }

            if (yaRecibieron.Contains(cliente.Id))
            {
                omitidoLogs.Add(new NotifLog
                {
                    OutboxId     = null,
                    ClienteId    = cliente.Id,
                    Tipo         = tipo,
                    PhoneNumber  = cliente.PhoneMain,
                    Mensaje      = string.Empty,
                    Estado       = NotifLogEstado.OMITIDO,
                    IntentoNum   = 0,
                    ErrorDetalle = "OMITIDO_ANTISPAM: mensaje enviado en las últimas 24h",
                    RegistradoAt = DateTime.UtcNow,
                });
                continue;
            }

            var contexto = await _contextBuilder.BuildAsync(cliente.Id);

            outboxBatch.Add(new NotifOutbox
            {
                Tipo         = tipo,
                ClienteId    = cliente.Id,
                PhoneNumber  = cliente.PhoneMain,
                Publicado    = false,
                Intentos     = 0,
                EnviarDesde  = enviarDesde,
                EstadoFinal  = null,
                CreadoAt     = DateTime.UtcNow,
                ContextoJson = JsonSerializer.Serialize(contexto),
            });
        }

        // D-13 — Los envíos y el registro de los omitidos se confirman JUNTOS.
        // Se guardaban por separado: si fallaba el segundo, los mensajes salían
        // pero no quedaba constancia de a quién no se le mandó ni por qué, que es
        // justo lo que alguien va a buscar cuando pregunte por los que faltan.
        if (outboxBatch.Count > 0)  await _outboxRepo.AddRangeAsync(outboxBatch);
        if (omitidoLogs.Count > 0)  await _logRepo.AddRangeAsync(omitidoLogs);

        if (outboxBatch.Count > 0 || omitidoLogs.Count > 0)
            await _outboxRepo.SaveChangesAsync();

        await _audit.LogAsync("Notificaciones", "NOTIF_ENVIO_MASIVO",
            $"Envío masivo tipo={tipo} programados={outboxBatch.Count} omitidos={omitidoLogs.Count} sinTelefono={sinTelefono}",
            userId: actorId, userName: actorName, ip: ip);

        return Result<BulkSendResultDto>.Success(
            new BulkSendResultDto(outboxBatch.Count, omitidoLogs.Count, sinTelefono));
    }


    public async Task<r> CancelNotifAsync(
        Guid notifId, Guid actorId, string actorName, string ip)
    {
        var outbox = await _outboxRepo.GetByIdAsync(notifId);
        if (outbox is null) return Result.Failure("Notificación no encontrada.");
        if (outbox.EstadoFinal.HasValue)
            return Result.Failure($"La notificación ya tiene estado final: {outbox.EstadoFinal}.");

        outbox.EstadoFinal = NotifEstadoFinal.CANCELADO;
        outbox.Publicado   = true;
        outbox.ProcesadoAt = DateTime.UtcNow;
        _outboxRepo.Update(outbox);
        await _outboxRepo.SaveChangesAsync();
        await _logRepo.AddAsync(new NotifLog
        {
            OutboxId     = outbox.Id,
            ClienteId    = outbox.ClienteId,
            Tipo         = outbox.Tipo,
            PhoneNumber  = outbox.PhoneNumber,
            Mensaje      = string.Empty,
            Estado       = NotifLogEstado.CANCELADO,
            IntentoNum   = outbox.Intentos,
            RegistradoAt = DateTime.UtcNow,
        });

        await _audit.LogAsync("Notificaciones", "NOTIF_CANCELLED",
            $"Notificación cancelada: {outbox.Id} tipo={outbox.Tipo}",
            userId: actorId, userName: actorName, ip: ip);

        return Result.Success();
    }


    public async Task<Result<CancelBulkResultDto>> CancelBulkAsync(
        NotifType tipo, string? razon, Guid actorId, string actorName, string ip)
    {
        var pendientes = await _outboxRepo.GetAll()
            .Where(o => o.Tipo == tipo && o.EstadoFinal == null && !o.Publicado)
            .ToListAsync();

        if (!pendientes.Any())
            return Result<CancelBulkResultDto>.Success(new CancelBulkResultDto(0));

        var logBatch = new List<NotifLog>(pendientes.Count);
        foreach (var o in pendientes)
        {
            o.EstadoFinal = NotifEstadoFinal.CANCELADO;
            o.Publicado   = true;
            o.ProcesadoAt = DateTime.UtcNow;
            logBatch.Add(new NotifLog
            {
                OutboxId     = o.Id,
                ClienteId    = o.ClienteId,
                Tipo         = o.Tipo,
                PhoneNumber  = o.PhoneNumber,
                Mensaje      = string.Empty,
                Estado       = NotifLogEstado.CANCELADO,
                IntentoNum   = o.Intentos,
                ErrorDetalle = razon,
                RegistradoAt = DateTime.UtcNow,
            });
        }

        // D-13 — La cancelación y su registro, en un solo guardado. Antes, si
        // fallaba el segundo, los envíos quedaban cancelados sin ninguna anotación
        // del motivo.
        _outboxRepo.UpdateRange(pendientes);
        await _logRepo.AddRangeAsync(logBatch);
        await _outboxRepo.SaveChangesAsync();

        await _audit.LogAsync("Notificaciones", "NOTIF_MASIVA_CANCELADA",
            $"Cancelación masiva tipo={tipo} cantidad={pendientes.Count}",
            userId: actorId, userName: actorName, ip: ip);

        return Result<CancelBulkResultDto>.Success(new CancelBulkResultDto(pendientes.Count));
    }


    private Task<List<Client>> LoadTargetClientsAsync(BulkSendDto dto) =>
        dto.SegmentId.HasValue
            ? _segmentSvc.GetClientesFromSegmentAsync(dto.SegmentId.Value)
            : _clientRepo.GetAll()
                .Where(c => !c.IsDeleted && c.Status == ClientStatus.Activo)
                .ToListAsync();
}
