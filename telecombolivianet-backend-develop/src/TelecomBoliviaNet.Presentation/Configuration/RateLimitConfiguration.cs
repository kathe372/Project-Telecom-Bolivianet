using System.Security.Claims;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

namespace TelecomBoliviaNet.Presentation.Configuration;

public static class RateLimitConfiguration
{
    public const string AuthPolicy = "auth";

    /// <summary>
    /// Los límites se aplican POR CLIENTE, no globalmente.
    ///
    /// Antes se usaba <c>AddFixedWindowLimiter(policy, ...)</c>, que crea UN ÚNICO
    /// limitador compartido por todas las peticiones del servicio. El efecto real
    /// no era "10 intentos de login por IP" sino "10 intentos de login en toda la
    /// empresa cada 5 minutos": cualquiera podía dejar sin acceso a todo el mundo
    /// gastando la cuota, y los 300 req/min de API los agotaba la propia interfaz
    /// con un par de operadores trabajando a la vez.
    ///
    /// Ahora cada política particiona por identidad del llamante (usuario
    /// autenticado si lo hay, IP en otro caso), de modo que un cliente ruidoso
    /// solo se limita a sí mismo.
    /// </summary>
    public static IServiceCollection AddRateLimiting(this IServiceCollection services)
    {
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.OnRejected = async (context, token) =>
            {
                context.HttpContext.Response.ContentType = "application/json";
                await context.HttpContext.Response.WriteAsync(
                    "{\"success\":false,\"message\":\"Demasiadas solicitudes. Por favor espere e intente nuevamente.\"}",
                    cancellationToken: token);
            };

            // Login y refresco: por IP. Un atacante contra una cuenta no puede
            // bloquear el acceso del resto de la organización.
            options.AddPolicy(AuthPolicy, context =>
                RateLimitPartition.GetFixedWindowLimiter(
                    partitionKey: ClientKey(context),
                    factory: _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit          = 10,
                        Window               = TimeSpan.FromMinutes(5),
                        QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                        QueueLimit           = 0,
                    }));

            // API general: 300 req/min por usuario autenticado (o por IP si es anónimo).
            //
            // Va como GlobalLimiter, no como política por endpoint: así se ENCADENA con las
            // políticas específicas en vez de reemplazarlas. Aplicarla con
            // `MapControllers().RequireRateLimiting("api")` parecía equivalente, pero esa
            // metadata PISA la del atributo [EnableRateLimiting(AuthPolicy)] del controlador de
            // auth: el login pasaba de 10 intentos/5 min a 300/min, es decir el cambio pensado
            // para reforzar la API debilitaba justo el endpoint más sensible.
            //
            // Antes esta política estaba declarada pero no la usaba ningún endpoint: toda la
            // API salvo login y refresh quedaba sin ningún techo, documentando una protección
            // que en realidad no existía.
            options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
                RateLimitPartition.GetFixedWindowLimiter(
                    partitionKey: ClientKey(context),
                    factory: _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit          = 300,
                        Window               = TimeSpan.FromMinutes(1),
                        QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                        QueueLimit           = 10,
                    }));
        });

        return services;
    }

    /// <summary>
    /// Clave de partición: el id del usuario autenticado si existe (sobrevive a
    /// cambios de IP y evita que toda una oficina tras un NAT comparta cuota) y,
    /// si no, la IP remota.
    ///
    /// Requiere <c>UseForwardedHeaders</c> para que la IP sea la real del cliente
    /// y no la del proxy — sin eso, todas las peticiones caerían en la misma
    /// partición y el límite volvería a ser global de facto.
    /// </summary>
    private static string ClientKey(HttpContext context)
    {
        var userId = context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!string.IsNullOrWhiteSpace(userId)) return $"user:{userId}";

        var ip = context.Connection.RemoteIpAddress?.ToString();
        return string.IsNullOrWhiteSpace(ip) ? "anon:unknown" : $"ip:{ip}";
    }
}
