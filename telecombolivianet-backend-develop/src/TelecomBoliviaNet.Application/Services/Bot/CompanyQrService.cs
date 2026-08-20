using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Domain.Entities.Admin;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Services.Bot;

/// <summary>
/// Gestiona el QR de pago global de la empresa, almacenado en SystemConfigs
/// (Bot:CompanyQrData / Bot:CompanyQrMime / Bot:CompanyQrExpiresAt / Bot:CompanyQrAlertSentDate).
/// Extraído de ConversationsController para que la Presentación no dependa de AppDbContext.
/// </summary>
public class CompanyQrService
{
    private readonly IGenericRepository<SystemConfig> _sysRepo;

    public CompanyQrService(IGenericRepository<SystemConfig> sysRepo)
        => _sysRepo = sysRepo;

    /// <summary>
    /// Guarda (upsert) el QR global: imagen en base64, mime y fecha de vencimiento.
    /// Resetea la marca de alerta de vencimiento. Persiste todo en un único SaveChanges.
    /// </summary>
    public async Task UploadAsync(string base64Data, string mimeType, DateOnly expiresAt)
    {
        await UpsertAsync(SystemConfigKeys.CompanyQrData,          base64Data);
        await UpsertAsync(SystemConfigKeys.CompanyQrMime,          mimeType);
        await UpsertAsync(SystemConfigKeys.CompanyQrExpiresAt,     expiresAt.ToString("yyyy-MM-dd"));
        await UpsertAsync(SystemConfigKeys.CompanyQrAlertSentDate, string.Empty);

        await _sysRepo.SaveChangesAsync();
    }

    /// <summary>Devuelve la imagen del QR global, o null si no hay QR configurado.</summary>
    public async Task<CompanyQrFileDto?> GetFileAsync()
    {
        var configs = await _sysRepo.GetAllReadOnly()
            .Where(c => c.Key == SystemConfigKeys.CompanyQrData
                     || c.Key == SystemConfigKeys.CompanyQrMime)
            .ToListAsync();

        var base64Data = configs.FirstOrDefault(c => c.Key == SystemConfigKeys.CompanyQrData)?.Value;
        var mimeType   = configs.FirstOrDefault(c => c.Key == SystemConfigKeys.CompanyQrMime)?.Value
                         ?? "image/jpeg";

        if (string.IsNullOrEmpty(base64Data))
            return null;

        return new CompanyQrFileDto(Convert.FromBase64String(base64Data), mimeType);
    }

    /// <summary>Devuelve metadatos del QR global (existencia, vencimiento, días restantes).</summary>
    public async Task<CompanyQrInfoDto> GetInfoAsync()
    {
        var configs = await _sysRepo.GetAllReadOnly()
            .Where(c => c.Key == SystemConfigKeys.CompanyQrData
                     || c.Key == SystemConfigKeys.CompanyQrExpiresAt)
            .ToListAsync();

        var dataCfg   = configs.FirstOrDefault(c => c.Key == SystemConfigKeys.CompanyQrData);
        var expiryCfg = configs.FirstOrDefault(c => c.Key == SystemConfigKeys.CompanyQrExpiresAt);

        var hasQr = dataCfg is not null && !string.IsNullOrEmpty(dataCfg.Value);

        DateOnly? expiresAt = DateOnly.TryParse(expiryCfg?.Value, out var d) ? d : null;
        int? daysRemaining  = expiresAt.HasValue
            ? (int)(expiresAt.Value.ToDateTime(TimeOnly.MinValue) - DateTime.UtcNow.Date).TotalDays
            : null;

        return new CompanyQrInfoDto(
            HasQr:         hasQr,
            UpdatedAt:     dataCfg?.UpdatedAt,
            ExpiresAt:     expiresAt?.ToString("yyyy-MM-dd"),
            DaysRemaining: daysRemaining);
    }

    /// <summary>
    /// Upsert en memoria (tracked): agrega o muta sin persistir.
    /// El commit lo hace el llamador con un único SaveChangesAsync.
    /// </summary>
    private async Task UpsertAsync(string key, string value)
    {
        var cfg = await _sysRepo.FirstOrDefaultAsync(c => c.Key == key);
        if (cfg is null)
        {
            await _sysRepo.AddAsync(new SystemConfig
            {
                Key       = key,
                Value     = value,
                UpdatedAt = DateTime.UtcNow,
            });
        }
        else
        {
            cfg.Value     = value;
            cfg.UpdatedAt = DateTime.UtcNow;
        }
    }
}

public record CompanyQrFileDto(byte[] Bytes, string MimeType);

public record CompanyQrInfoDto(
    bool      HasQr,
    DateTime? UpdatedAt,
    string?   ExpiresAt,
    int?      DaysRemaining
);
