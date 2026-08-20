using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Domain.Entities.Audit;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Services.Auth;

public class AuditService
{
    private readonly IGenericRepository<AuditLog> _repo;
    private readonly ILogger<AuditService>        _logger;

    public AuditService(
        IGenericRepository<AuditLog> repo,
        ILogger<AuditService>        logger)
    {
        _repo   = repo;
        _logger = logger;
    }

    public async Task LogAsync(
        string module,
        string action,
        string description,
        Guid? userId       = null,
        string userName    = "Sistema",
        string? ip         = null,
        string? userAgent  = null,
        string? prevData   = null,
        string? newData    = null,
        Guid? entityId     = null)
    {
        try
        {
            var now = DateTime.UtcNow;
            var entry = new AuditLog
            {
                UserId       = userId,
                UserName     = userName,
                Module       = module,
                Action       = action,
                Description  = description,
                IpAddress    = ip,
                UserAgent    = userAgent,
                PreviousData = prevData,
                NewData      = newData,
                EntityId     = entityId,
                CreatedAt    = now,
            };
            var hashInput = $"{userId}|{userName}|{module}|{action}|{description}|{entityId}|{ip}|{userAgent}|{now:O}";
            entry.IntegrityHash = Convert.ToHexString(
                SHA256.HashData(Encoding.UTF8.GetBytes(hashInput)));
            await _repo.AddAsync(entry);
            await _repo.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "Error escribiendo audit log. Module={Module} Action={Action} User={User}",
                module, action, userName);
        }
    }
}
