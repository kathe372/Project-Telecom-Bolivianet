using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Entities.Notifications;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Services.Notifications;

public class NotifPublisher : INotifPublisher
{
    private readonly IGenericRepository<NotifConfig>     _configRepo;
    private readonly IGenericRepository<NotifOutbox>     _outboxRepo;
    private readonly IGenericRepository<NotifLog>        _logRepo;
    private readonly NotifContextBuilderService          _contextBuilder;
    private readonly ILogger<NotifPublisher>             _logger;

    public NotifPublisher(
        IGenericRepository<NotifConfig>  configRepo,
        IGenericRepository<NotifOutbox>  outboxRepo,
        IGenericRepository<NotifLog>     logRepo,
        NotifContextBuilderService       contextBuilder,
        ILogger<NotifPublisher>          logger)
    {
        _configRepo     = configRepo;
        _outboxRepo     = outboxRepo;
        _logRepo        = logRepo;
        _contextBuilder = contextBuilder;
        _logger         = logger;
    }

    public async Task PublishAsync(
        NotifType                  tipo,
        Guid                       clienteId,
        string?                    phoneNumber,
        Dictionary<string, string> contexto,
        Guid?                      referenciaId = null)
    {
        var config = await _configRepo.GetAll()
            .FirstOrDefaultAsync(c => c.Tipo == tipo);

        if (config is null || !config.Activo)
        {
            _logger.LogDebug("NotifPublisher: tipo {Tipo} desactivado o sin config. Omitido.", tipo);
            return;
        }

        if (string.IsNullOrWhiteSpace(phoneNumber))
        {
            _logger.LogWarning("NotifPublisher: cliente {Id} sin teléfono para tipo {Tipo}. OMITIDO.", clienteId, tipo);
            await _logRepo.AddAsync(new NotifLog
            {
                OutboxId     = null,
                ClienteId    = clienteId,
                Tipo         = tipo,
                PhoneNumber  = string.Empty,
                Mensaje      = string.Empty,
                Estado       = NotifLogEstado.OMITIDO,
                IntentoNum   = 0,
                ErrorDetalle = "Cliente sin PhoneMain registrado",
                RegistradoAt = DateTime.UtcNow,
            });
            await _logRepo.SaveChangesAsync();
            return;
        }

        if (contexto.Count == 0)
        {
            _logger.LogDebug("NotifPublisher: contexto vacío para {Tipo} cliente={Id}. Auto-construyendo.", tipo, clienteId);
            contexto = await _contextBuilder.BuildAsync(clienteId);
        }

        var enviarDesde = DateTime.UtcNow.AddSeconds(config.DelaySegundos);

        var outbox = new NotifOutbox
        {
            Tipo         = tipo,
            ClienteId    = clienteId,
            PhoneNumber  = phoneNumber,
            Publicado    = false,
            Intentos     = 0,
            EnviarDesde  = enviarDesde,
            EstadoFinal  = null,
            CreadoAt     = DateTime.UtcNow,
            ContextoJson = JsonSerializer.Serialize(contexto),
            ReferenciaId = referenciaId,
        };

        await _outboxRepo.AddAsync(outbox);
        await _outboxRepo.SaveChangesAsync();
        _logger.LogInformation(
            "NotifPublisher: outbox insertado tipo={Tipo} cliente={Id} enviarDesde={Desde}",
            tipo, clienteId, enviarDesde);
    }
}
