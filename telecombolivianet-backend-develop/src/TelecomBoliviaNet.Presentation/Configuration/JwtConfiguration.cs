using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

namespace TelecomBoliviaNet.Presentation.Configuration;

public static class JwtConfiguration
{
    public static IServiceCollection AddJwtAuthentication(
        this IServiceCollection services, IConfiguration config)
    {
        var key = config["Jwt:Key"]
            ?? throw new InvalidOperationException(
                "Jwt:Key no configurado en appsettings.");

        services
            .AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
                options.DefaultChallengeScheme    = JwtBearerDefaults.AuthenticationScheme;
            })
            .AddJwtBearer(options =>
            {
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer           = true,
                    ValidateAudience         = true,
                    ValidateLifetime         = true,
                    ValidateIssuerSigningKey = true,
                    ValidIssuer              = config["Jwt:Issuer"],
                    ValidAudience            = config["Jwt:Audience"],
                    IssuerSigningKey         = new SymmetricSecurityKey(
                                                Encoding.UTF8.GetBytes(key)),
                    ClockSkew                = TimeSpan.Zero
                };

                options.Events = new JwtBearerEvents
                {
                    OnMessageReceived = ctx =>
                    {
                        var accessToken = ctx.Request.Query["access_token"];
                        var path        = ctx.HttpContext.Request.Path;

                        if (!string.IsNullOrEmpty(accessToken) &&
                            path.StartsWithSegments("/hubs"))
                        {
                            ctx.Token = accessToken;
                        }
                        return Task.CompletedTask;
                    },

                    OnChallenge = ctx =>
                    {
                        ctx.HandleResponse();
                        ctx.Response.StatusCode  = 401;
                        ctx.Response.ContentType = "application/json";
                        return ctx.Response.WriteAsJsonAsync(new
                        {
                            message = "No autenticado. Se requiere un token válido."
                        });
                    },

                    OnForbidden = ctx =>
                    {
                        ctx.Response.StatusCode  = 403;
                        ctx.Response.ContentType = "application/json";
                        return ctx.Response.WriteAsJsonAsync(new
                        {
                            message = "No tienes permisos para realizar esta acción."
                        });
                    }
                };
            });

        services.AddAuthorizationBuilder()
            .AddPolicy("AdminOnly",                p => p.RequireRole("Admin"))
            .AddPolicy("AdminOrTecnico",           p => p.RequireRole("Admin", "Tecnico"))
            .AddPolicy("AdminOrOperador",          p => p.RequireRole("Admin", "Operador"))
            .AddPolicy("AdminOrOperadorOrTecnico", p => p.RequireRole("Admin", "Operador", "Tecnico"))
            .AddPolicy("AllRoles",                 p => p.RequireRole("Admin", "Operador", "Tecnico", "SocioLectura"))

            // F8.1 — Las dos puertas por las que entra el chatbot. Son las mismas
            // de arriba MÁS el rol Bot, así que ningún humano pierde nada: lo único
            // que cambian es que el bot no necesita hacerse pasar por técnico.
            //
            // Están aparte a propósito. Añadir "Bot" a AllRoles habría sido una
            // línea en vez de veintidós atributos, pero le habría abierto de paso el
            // dashboard, el informe anual, el historial de cualquier cliente y la
            // descarga de sus adjuntos. Cada endpoint que el bot alcanza es una
            // concesión escrita, y BotEndpointsIntegrationTests las enumera.
            .AddPolicy("AllRolesOrBot",            p => p.RequireRole("Admin", "Operador", "Tecnico", "SocioLectura", "Bot"))
            .AddPolicy("AdminOrTecnicoOrBot",      p => p.RequireRole("Admin", "Tecnico", "Bot"))
            .AddPolicy("AdminOrOperadorOrTecnicoOrBot",
                                                   p => p.RequireRole("Admin", "Operador", "Tecnico", "Bot"));

        return services;
    }
}
