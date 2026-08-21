using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Services.Auth;

public class RefreshTokenService
{
    private readonly IGenericRepository<RefreshToken> _tokenRepo;
    private readonly IConfiguration                   _config;
    private readonly ILogger<RefreshTokenService>     _logger;

    private int ExpirationDays =>
        int.Parse(_config["Jwt:RefreshTokenExpirationDays"] ?? "30");

    public RefreshTokenService(
        IGenericRepository<RefreshToken> tokenRepo,
        IConfiguration                   config,
        ILogger<RefreshTokenService>     logger)
    {
        _tokenRepo = tokenRepo;
        _config    = config;
        _logger    = logger;
    }


    public async Task<string> GenerateAsync(Guid userId, string? clientIp)
    {
        var rawToken  = GenerateOpaqueToken();
        var tokenHash = ComputeHash(rawToken);

        var entity = new RefreshToken
        {
            TokenHash    = tokenHash,
            UserId       = userId,
            ExpiresAt    = DateTime.UtcNow.AddDays(ExpirationDays),
            CreatedByIp  = clientIp,
            CreatedAt    = DateTime.UtcNow,
        };

        await _tokenRepo.AddAsync(entity);
        await _tokenRepo.SaveChangesAsync();

        _logger.LogDebug("RefreshToken generado para usuario {UserId}, expira {Expiry}",
            userId, entity.ExpiresAt);

        return rawToken;
    }


    public async Task<(RefreshToken? entity, string? newRawToken)> RotateAsync(
        string rawToken, string? clientIp)
    {
        var hash   = ComputeHash(rawToken);
        var stored = await _tokenRepo.GetAll()
            .FirstOrDefaultAsync(t => t.TokenHash == hash);

        if (stored is null)
        {
            _logger.LogWarning("RefreshToken no encontrado. Hash: {Hash}", hash[..8] + "...");
            return (null, null);
        }

        if (stored.IsRevoked)
        {
            _logger.LogWarning(
                "RefreshToken reutilizado detectado para usuario {UserId}. " +
                "Revocando toda la sesión.", stored.UserId);

            await RevokeAllForUserAsync(stored.UserId,
                "Reutilización de refresh token detectada — posible robo de token.");
            return (null, null);
        }

        if (stored.IsExpired)
        {
            _logger.LogInformation("RefreshToken expirado para usuario {UserId}", stored.UserId);
            return (null, null);
        }

        var newRawToken  = GenerateOpaqueToken();
        var newTokenHash = ComputeHash(newRawToken);

        stored.RevokedAt           = DateTime.UtcNow;
        stored.ReplacedByTokenHash = newTokenHash;
        _tokenRepo.Update(stored);
        await _tokenRepo.SaveChangesAsync();
        var newEntity = new RefreshToken
        {
            TokenHash   = newTokenHash,
            UserId      = stored.UserId,
            ExpiresAt   = DateTime.UtcNow.AddDays(ExpirationDays),
            CreatedByIp = clientIp,
            CreatedAt   = DateTime.UtcNow,
        };
        await _tokenRepo.AddAsync(newEntity);
        await _tokenRepo.SaveChangesAsync();

        _logger.LogDebug("RefreshToken rotado para usuario {UserId}", stored.UserId);
        return (stored, newRawToken);
    }


    public async Task RevokeAllForUserAsync(Guid userId, string reason = "Logout")
    {
        var activeTokens = await _tokenRepo.GetAll()
            .Where(t => t.UserId == userId && t.RevokedAt == null)
            .ToListAsync();

        if (activeTokens.Count == 0) return;

        foreach (var token in activeTokens)
            token.RevokedAt = DateTime.UtcNow;

        _tokenRepo.UpdateRange(activeTokens);

        await _tokenRepo.SaveChangesAsync();
        _logger.LogInformation(
            "RefreshTokens revocados para usuario {UserId}: {Count} tokens. Razón: {Reason}",
            userId, activeTokens.Count, reason);
    }


    public async Task<int> PurgeExpiredAsync()
    {
        var cutoff  = DateTime.UtcNow.AddDays(-1);
        var expired = await _tokenRepo.GetAll()
            .Where(t => t.ExpiresAt < cutoff)
            .ToListAsync();

        if (expired.Count > 0)
            _tokenRepo.RemoveRange(expired);
            await _tokenRepo.SaveChangesAsync();
        if (expired.Count > 0)
            _logger.LogInformation("RefreshTokens expirados eliminados: {Count}", expired.Count);

        return expired.Count;
    }


    private static string GenerateOpaqueToken()
    {
        var bytes = RandomNumberGenerator.GetBytes(32);
        return Convert.ToBase64String(bytes)
            .Replace('+', '-').Replace('/', '_').TrimEnd('=');
    }

    public static string ComputeHash(string rawToken)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(rawToken));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}
