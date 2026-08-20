using Microsoft.Extensions.Caching.Memory;
using TelecomBoliviaNet.Application.Services.Auth;

namespace TelecomBoliviaNet.Presentation.Middleware;

public class TokenBlacklistMiddleware
{
    private readonly RequestDelegate _next;
    private readonly IMemoryCache    _cache;

    private const string CacheKeyPrefix = "tbl:";

    /// <summary>
    /// Los tokens revocados se cachean 15 min: una vez en la lista negra, un
    /// token no sale de ella, así que un positivo puede vivir largo sin riesgo.
    /// </summary>
    private static readonly TimeSpan PositiveTtl = TimeSpan.FromMinutes(15);

    /// <summary>
    /// Los tokens VÁLIDOS también se cachean, pero poco tiempo: es la ventana
    /// máxima en la que un token seguiría funcionando después de un logout.
    ///
    /// Antes solo se cacheaban los positivos — es decir, el caso que casi nunca
    /// ocurre. El 99,9 % del tráfico (tokens válidos) pagaba un SELECT sobre
    /// TokenBlacklists en CADA petición autenticada, contra una tabla que además
    /// crecía sin límite.
    /// </summary>
    private static readonly TimeSpan NegativeTtl = TimeSpan.FromMinutes(2);

    public TokenBlacklistMiddleware(RequestDelegate next, IMemoryCache cache)
    {
        _next  = next;
        _cache = cache;
    }

    /// <summary>
    /// Clave de caché para un token dado. Pública para que el logout pueda marcar
    /// el token como revocado en caliente, en vez de esperar a que caduque el
    /// negativo cacheado (la ventana de <see cref="NegativeTtl"/>).
    /// </summary>
    public static string CacheKeyFor(string token)
    {
        var parts      = token.Split('.');
        var uniquePart = parts.Length == 3 ? parts[2] : token;
        return CacheKeyPrefix + uniquePart[..Math.Min(uniquePart.Length, 32)];
    }

    /// <summary>Marca un token como revocado en la caché inmediatamente.</summary>
    public static void MarkRevoked(IMemoryCache cache, string token)
        => cache.Set(CacheKeyFor(token), true, PositiveTtl);

    public async Task InvokeAsync(HttpContext context, AuthService authService)
    {
        var authHeader = context.Request.Headers.Authorization.ToString();

        if (!string.IsNullOrEmpty(authHeader) && authHeader.StartsWith("Bearer "))
        {
            var token    = authHeader.Replace("Bearer ", "").Trim();
            var cacheKey = CacheKeyFor(token);

            if (!_cache.TryGetValue(cacheKey, out bool isBlacklisted))
            {
                isBlacklisted = await authService.IsTokenBlacklistedAsync(token);
                _cache.Set(cacheKey, isBlacklisted, isBlacklisted ? PositiveTtl : NegativeTtl);
            }

            if (isBlacklisted)
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                await context.Response.WriteAsJsonAsync(new
                {
                    message = "La sesión ha sido cerrada. Inicia sesión nuevamente."
                });
                return;
            }
        }

        await _next(context);
    }
}
