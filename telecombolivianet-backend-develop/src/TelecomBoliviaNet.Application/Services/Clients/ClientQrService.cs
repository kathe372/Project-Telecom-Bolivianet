using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.DTOs.Clients;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;
using TelecomBoliviaNet.Application.Constants;

namespace TelecomBoliviaNet.Application.Services.Clients;

public class ClientQrService : IClientQrService
{
    private readonly IClientQrRepository   _qrRepo;
    private readonly IGenericRepository<Client>      _clientRepo;
    private readonly IUserRepository  _userRepo;
    private readonly IFileStorage                    _fileStorage;
    private readonly AuditService                    _audit;
    private readonly ILogger<ClientQrService>        _logger;

    private const int AlertDaysBefore = 5;

    public ClientQrService(
        IClientQrRepository  qrRepo,
        IGenericRepository<Client>    clientRepo,
        IUserRepository userRepo,
        IFileStorage                  fileStorage,
        AuditService                  audit,
        ILogger<ClientQrService>      logger)
    {
        _qrRepo      = qrRepo;
        _clientRepo  = clientRepo;
        _userRepo    = userRepo;
        _fileStorage = fileStorage;
        _audit       = audit;
        _logger      = logger;
    }


    public async Task<Result<ClientQrDto>> UploadQrAsync(
        Guid clientId,
        IFormFile file,
        UpdateClientQrDto meta,
        Guid actorId, string actorName, string ip)
    {
        var client = await _clientRepo.GetByIdAsync(clientId);
        if (client is null)
            return Result<ClientQrDto>.Failure("Cliente no encontrado.");

        if (file is null || file.Length == 0)
            return Result<ClientQrDto>.Failure("Debes adjuntar una imagen.");
        if (file.Length > 3 * 1024 * 1024)
            return Result<ClientQrDto>.Failure("La imagen no puede superar 3 MB.");

        var allowed = new[] { "image/jpeg", "image/png", "image/webp" };
        if (!allowed.Contains(file.ContentType.ToLower()))
            return Result<ClientQrDto>.Failure("Formato no permitido. Use JPG, PNG o WebP.");

        var anterior = await _qrRepo.GetActiveAsync(clientId);

        // D-13 — Desactivar el anterior NO se confirma por su cuenta.
        //
        // Se guardaba aquí, y entre este punto y el alta del nuevo QR hay una
        // subida de archivo a almacenamiento externo, que puede fallar. Cuando
        // fallaba, el cliente se quedaba con el QR viejo desactivado y ninguno
        // nuevo: sin forma de pagar, y sin que nadie se enterara.
        //
        // Ahora se marca en memoria y se confirma abajo, con el alta. Si la
        // subida falla, no se persiste nada y el QR anterior sigue vigente.
        if (anterior is not null)
        {
            anterior.IsActive           = false;
            anterior.DeactivatedReason  = "Reemplazado por nuevo QR";
            _qrRepo.Update(anterior);
        }

        using var stream = file.OpenReadStream();
        var fileName = $"qr_{clientId}_{DateTime.UtcNow:yyyyMMddHHmmss}.png";
        var imageUrl = await _fileStorage.SaveAsync(stream, fileName, "qr");

        DateTime? expiresAt = meta.ExpiresInDays.HasValue
            ? DateTime.UtcNow.AddDays(meta.ExpiresInDays.Value)
            : null;

        var qr = new ClientQr
        {
            ClientId     = clientId,
            ImageUrl     = imageUrl,
            ExpiresAt    = expiresAt,
            IsActive     = true,
            AlertSent    = false,
            UploadedAt   = DateTime.UtcNow,
            UploadedById = actorId,
        };
        await _qrRepo.AddAsync(qr);
        await _qrRepo.SaveChangesAsync();

        await _audit.LogAsync("Clientes", "CLIENT_QR_UPLOADED",
            $"QR subido para cliente {client.TbnCode} — {client.FullName}" +
            (expiresAt.HasValue ? $" — expira {expiresAt:dd/MM/yyyy}" : " — sin expiración"),
            actorId, actorName, ip);

        var actor = await _userRepo.GetByIdAsync(actorId);
        return Result<ClientQrDto>.Success(MapDto(qr, actor?.FullName ?? actorName));
    }


    public async Task<(ClientQrDto? Dto, byte[]? ImageBytes, string? ContentType)>
        GetActiveQrAsync(Guid clientId)
    {
        var now = DateTime.UtcNow;

        var qr = await _qrRepo.GetActiveValidAsync(clientId, now);

        if (qr is null) return (null, null, null);

        try
        {
            var (bytes, contentType) = await _fileStorage.ReadAsync(qr.ImageUrl);
            var actor = await _userRepo.GetByIdAsync(qr.UploadedById);
            return (MapDto(qr, actor?.FullName ?? "Sistema"), bytes, contentType);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error leyendo imagen QR del cliente {ClientId}", clientId);
            return (null, null, null);
        }
    }


    public async Task DeactivateExpiredQrsAsync()
    {
        var now     = DateTime.UtcNow;
        var expired = await _qrRepo.GetExpiredAsync(now);

        foreach (var qr in expired)
        {
            qr.IsActive          = false;
            qr.DeactivatedReason = "Expirado automáticamente";
            _qrRepo.Update(qr);
        }

        // Un solo guardado para todo el lote: antes se confirmaba dentro del
        // bucle, una transacción por QR.
        if (expired.Count > 0) await _qrRepo.SaveChangesAsync();

        if (expired.Count > 0)
            _logger.LogInformation("QrService: {Count} QRs desactivados por expiración", expired.Count);
    }


    public async Task<List<ClientQrDto>> GetHistorialAsync(Guid clientId)
    {
        var qrs = await _qrRepo.GetHistoryAsync(clientId);

        var actorIds = qrs.Select(q => q.UploadedById).Distinct().ToList();
        var actors   = await _userRepo.GetNamesByIdsAsync(actorIds);

        return qrs.Select(q => MapDto(q, actors.GetValueOrDefault(q.UploadedById, "Sistema"))).ToList();
    }


    public async Task<List<(Guid ClientId, string ClientName, string TbnCode, DateTime ExpiresAt)>>
        GetQrsExpiringSoonAsync()
    {
        var alertDate = DateTime.UtcNow.AddDays(AlertDaysBefore);

        var qrs = await _qrRepo.GetExpiringSoonAsync(DateTime.UtcNow, alertDate);

        return qrs.Select(q => (
            q.ClientId,
            q.Client?.FullName ?? AppConstants.Display.SinDato,
            q.Client?.TbnCode  ?? AppConstants.Display.SinDato,
            q.ExpiresAt!.Value
        )).ToList();
    }

    public async Task MarkAlertSentAsync(Guid clientId)
    {
        var qr = await _qrRepo.GetActiveAsync(clientId);

        if (qr is not null)
        {
            qr.AlertSent = true;
            _qrRepo.Update(qr);
            await _qrRepo.SaveChangesAsync();
        }
    }


    private static ClientQrDto MapDto(ClientQr q, string uploaderName)
    {
        int? daysUntilExpiry = q.ExpiresAt.HasValue
            ? (int)Math.Round((q.ExpiresAt.Value - DateTime.UtcNow).TotalDays)
            : null;

        return new ClientQrDto(
            q.Id, q.ImageUrl, q.ExpiresAt, q.IsActive,
            q.AlertSent, q.UploadedAt, uploaderName, daysUntilExpiry);
    }
}
