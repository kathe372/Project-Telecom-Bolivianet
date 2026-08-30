using Serilog;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Infrastructure.Data;
using TelecomBoliviaNet.Presentation.Configuration;
using TelecomBoliviaNet.Presentation.Middleware;
using TelecomBoliviaNet.Presentation.Hubs;

Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateBootstrapLogger();

try
{
    Log.Information("Iniciando TelecomBoliviaNet API...");

    var builder = WebApplication.CreateBuilder(args);

    var runtimeSettingsPath = Path.Combine(builder.Environment.ContentRootPath, "appsettings.runtime.json");
    if (!File.Exists(runtimeSettingsPath))
        File.WriteAllText(runtimeSettingsPath, "{}");
    builder.Configuration.AddJsonFile("appsettings.runtime.json",
        optional: true, reloadOnChange: true);

    builder.Host.UseSerilog((ctx, services, config) =>
        config.ReadFrom.Configuration(ctx.Configuration)
              .ReadFrom.Services(services)
              .Enrich.FromLogContext()
              .WriteTo.Console());

    {
        var jwtKey = builder.Configuration["Jwt:Key"];
        if (string.IsNullOrWhiteSpace(jwtKey) || jwtKey.Length < 32)
            throw new InvalidOperationException(
                "Jwt:Key debe tener al menos 32 caracteres. " +
                "En desarrollo: appsettings.Development.json. " +
                "En producción: variable de entorno Jwt__Key o dotnet user-secrets.");
    }

    builder.Services.AddApplicationServices(builder.Configuration);

    builder.Services.AddExceptionHandler<TelecomBoliviaNet.Presentation.Middleware.GlobalExceptionHandler>();
    builder.Services.AddProblemDetails();

    builder.Services.AddMemoryCache();

    builder.Services.AddJwtAuthentication(builder.Configuration);

    builder.Services.AddRateLimiting();

    // Detrás del proxy de Railway/Nginx, RemoteIpAddress es la IP del PROXY: todas
    // las peticiones parecían venir del mismo sitio, así que los logs de auditoría
    // registraban una IP inútil y cualquier límite por IP habría sido global.
    // KnownNetworks/Proxies se vacían porque el proxy no tiene una IP fija conocida;
    // la cabecera solo es de fiar porque el servicio no se expone directamente.
    builder.Services.Configure<ForwardedHeadersOptions>(options =>
    {
        options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
        options.ForwardLimit     = 2;
        options.KnownNetworks.Clear();
        options.KnownProxies.Clear();
    });

    builder.Services.AddSignalR(options =>
    {
        options.EnableDetailedErrors = builder.Environment.IsDevelopment();
        options.KeepAliveInterval    = TimeSpan.FromSeconds(15);
        options.ClientTimeoutInterval = TimeSpan.FromSeconds(30);
    });

    var allowedOrigins = builder.Configuration
        .GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];

    builder.Services.AddCors(options =>
        options.AddPolicy("Frontend", policy =>
            policy.WithOrigins(allowedOrigins)
                  .WithHeaders("Content-Type", "Authorization", "X-Requested-With")
                  .WithMethods("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS")
                  .AllowCredentials()));

    builder.Services.AddApiVersioning(options =>
    {
        options.DefaultApiVersion = new Asp.Versioning.ApiVersion(1, 0);
        options.AssumeDefaultVersionWhenUnspecified = true;
        options.ReportApiVersions = true;
    }).AddMvc();

    builder.Services
        // E-03 — Validar el cuerpo deja de ser cosa de cada endpoint. Antes el
        // mismo bloque estaba copiado 17 veces y dependía de que quien escribiera
        // el endpoint se acordara; ahora, si el DTO tiene validador registrado, se
        // valida. Ver ValidacionDeCuerpoFilter.
        .AddControllers(o => o.Filters.Add<ValidacionDeCuerpoFilter>())
        .AddJsonOptions(o =>
        {
            o.JsonSerializerOptions.PropertyNamingPolicy = null;
            o.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
        });

    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwagger();

    var app = builder.Build();

    if (!app.Configuration.GetValue<bool>("SkipStartupMigration"))
    using (var scope = app.Services.CreateScope())
    {
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Log.Information("Verificando migraciones de base de datos...");

        try
        {
            // F8.2 — Qué esquema cambia en ESTE arranque, por su nombre y ANTES de
            // aplicarlo. Hasta ahora el arranque solo decía cuántas migraciones
            // había en total al terminar, así que cuando un despliegue rompía la
            // base no quedaba registro de qué había tocado. Con el historial de
            // este proyecto —migraciones sin [Migration], PostGIS que no existía en
            // Railway— es la línea de log que hace falta para el diagnóstico.
            var pending = (await db.Database.GetPendingMigrationsAsync()).ToList();
            if (pending.Count > 0)
                Log.Warning("Migraciones PENDIENTES ({Count}): {Migraciones}",
                    pending.Count, string.Join(", ", pending));
            else
                Log.Information("Sin migraciones pendientes.");

            await db.Database.MigrateAsync();

            var applied = (await db.Database.GetAppliedMigrationsAsync()).ToList();
            Log.Information("Migraciones al día. Total en DB: {Count}", applied.Count);
        }
        catch (Exception exMigrate)
        {
            Log.Fatal(exMigrate,
                "ERROR CRÍTICO en migración — revisa la cadena de conexión y permisos de la BD.");
            throw;
        }

        if (!await db.UserSystems.AnyAsync())
        {
            Log.Information("Insertando datos iniciales (admin, planes, secuencia TBN)...");

            // La contraseña del admin semilla ya NO va en el código fuente: antes
            // aquí había un hash bcrypt fijo y versionado, es decir, material de
            // ataque offline publicado en el repositorio. Se toma de
            // ADMIN_SEED_PASSWORD y, si no está, se genera una aleatoria que se
            // registra una única vez y obliga a cambiarla en el primer acceso.
            var seedHasher   = scope.ServiceProvider.GetRequiredService<TelecomBoliviaNet.Application.Interfaces.IPasswordHasher>();
            var seedPassword = builder.Configuration["ADMIN_SEED_PASSWORD"];
            var generated    = string.IsNullOrWhiteSpace(seedPassword);

            if (generated)
            {
                seedPassword = Convert.ToBase64String(
                    System.Security.Cryptography.RandomNumberGenerator.GetBytes(18));
                Log.Warning(
                    "ADMIN_SEED_PASSWORD no configurado. Contraseña temporal del admin " +
                    "generada para este arranque: {Password} — cámbiala al primer inicio de sesión.",
                    seedPassword);
            }

            db.UserSystems.Add(new TelecomBoliviaNet.Domain.Entities.Auth.UserSystem
            {
                Id                     = Guid.Parse("00000000-0000-0000-0000-000000000001"),
                FullName               = "Administrador del Sistema",
                Email                  = "admin@telecombolivianet.bo",
                PasswordHash           = seedHasher.Hash(seedPassword!),
                Role                   = TelecomBoliviaNet.Domain.Entities.Auth.UserRole.Admin,
                Status                 = TelecomBoliviaNet.Domain.Entities.Auth.UserStatus.Activo,
                RequiresPasswordChange = generated,
                FailedLoginAttempts    = 0,
                CreatedAt              = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc)
            });

            if (!await db.TbnSequences.AnyAsync())
            {
                db.TbnSequences.Add(new TelecomBoliviaNet.Domain.Entities.Clients.TbnSequence
                {
                    Id        = 1,
                    LastValue = 0,
                    Prefix    = "TBN"
                });
            }

            if (!await db.Plans.AnyAsync())
            {
                db.Plans.AddRange(
                    new TelecomBoliviaNet.Domain.Entities.Plans.Plan
                    {
                        Id = Guid.Parse("00000000-0000-0000-0001-000000000001"),
                        Name = "Plan Cobre", SpeedMb = 30, MonthlyPrice = 99.00m,
                        IsActive = true, CreatedAt = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc)
                    },
                    new TelecomBoliviaNet.Domain.Entities.Plans.Plan
                    {
                        Id = Guid.Parse("00000000-0000-0000-0001-000000000002"),
                        Name = "Plan Plata", SpeedMb = 50, MonthlyPrice = 149.00m,
                        IsActive = true, CreatedAt = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc)
                    },
                    new TelecomBoliviaNet.Domain.Entities.Plans.Plan
                    {
                        Id = Guid.Parse("00000000-0000-0000-0001-000000000003"),
                        Name = "Plan Oro", SpeedMb = 80, MonthlyPrice = 199.00m,
                        IsActive = true, CreatedAt = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc)
                    }
                );
            }

            await db.SaveChangesAsync();
            Log.Information("Datos iniciales insertados. Usuario admin creado (ver .env o documentación para credenciales).");
        }

        // El reseteo del admin es una operación EXPLÍCITA (RESET_ADMIN=true), no una
        // reacción automática al estado del usuario.
        //
        // Antes se disparaba también con `RequiresPasswordChange == true` (que es
        // justamente el estado que deja este mismo bloque) o con 3 intentos fallidos,
        // y la falta de ADMIN_RESET_PASSWORD lanzaba una excepción: bastaba con que
        // un admin no hubiese cambiado su contraseña temporal para que NINGÚN
        // despliegue posterior arrancara. Un estado benigno de un usuario tumbaba
        // todo el servicio.
        var resetAdmin = string.Equals(
            builder.Configuration["RESET_ADMIN"], "true", StringComparison.OrdinalIgnoreCase);

        if (resetAdmin)
        {
            var adminUser = await db.UserSystems.FindAsync(Guid.Parse("00000000-0000-0000-0000-000000000001"));
            var adminResetPassword = builder.Configuration["ADMIN_RESET_PASSWORD"];

            if (adminUser is null)
            {
                Log.Warning("RESET_ADMIN=true pero no existe el usuario admin semilla — se omite el reseteo.");
            }
            else if (string.IsNullOrWhiteSpace(adminResetPassword))
            {
                // Warning, NO excepción: la app debe arrancar igual.
                Log.Warning(
                    "RESET_ADMIN=true pero ADMIN_RESET_PASSWORD no está configurado — " +
                    "se omite el reseteo del admin y la aplicación continúa arrancando. " +
                    "Define ADMIN_RESET_PASSWORD si realmente necesitas resetear la contraseña.");
            }
            else
            {
                var hasherReset = scope.ServiceProvider.GetRequiredService<TelecomBoliviaNet.Application.Interfaces.IPasswordHasher>();
                adminUser.PasswordHash           = hasherReset.Hash(adminResetPassword);
                adminUser.Status                 = TelecomBoliviaNet.Domain.Entities.Auth.UserStatus.Activo;
                adminUser.FailedLoginAttempts    = 0;
                adminUser.RequiresPasswordChange = true;
                adminUser.UpdatedAt              = DateTime.UtcNow;
                await db.SaveChangesAsync();
                Log.Warning("Admin reseteado — contraseña temporal aplicada desde ADMIN_RESET_PASSWORD. Cambiarla al primer login.");
            }
        }

        var botPassword = builder.Configuration["SISTEMA_BOT_PASSWORD"]
            ?? Environment.GetEnvironmentVariable("SISTEMA_BOT_PASSWORD");
        var botEmail    = builder.Configuration["SISTEMA_BOT_EMAIL"]
            ?? Environment.GetEnvironmentVariable("SISTEMA_BOT_EMAIL")
            ?? "bot@telecombolivianet.bo";

        if (!string.IsNullOrWhiteSpace(botPassword))
        {
            var botExists = await db.UserSystems.AnyAsync(u => u.Email == botEmail);
            if (!botExists)
            {
                var hasher   = scope.ServiceProvider.GetRequiredService<TelecomBoliviaNet.Application.Interfaces.IPasswordHasher>();
                var botHash  = hasher.Hash(botPassword);
                db.UserSystems.Add(new TelecomBoliviaNet.Domain.Entities.Auth.UserSystem
                {
                    FullName               = "Bot Chatbot WhatsApp",
                    Email                  = botEmail,
                    PasswordHash           = botHash,
                    // F8.1 — Rol propio. En una base nueva el chatbot nace ya
                    // acotado a sus 22 endpoints. El usuario que YA existe en
                    // producción sigue como Tecnico: moverlo es un UPDATE de una
                    // fila y está condicionado a probar el flujo por WhatsApp
                    // primero — ver PLAN_MEJORA_TECNICA_2026-08.md, paso 8.1.
                    Role                   = TelecomBoliviaNet.Domain.Entities.Auth.UserRole.Bot,
                    Status                 = TelecomBoliviaNet.Domain.Entities.Auth.UserStatus.Activo,
                    RequiresPasswordChange = false,
                    FailedLoginAttempts    = 0,
                    CreatedAt              = DateTime.UtcNow
                });
                await db.SaveChangesAsync();
                Log.Information("Usuario bot creado: {Email} (rol Bot)", botEmail);
            }
            else
            {
                Log.Information("Usuario bot ya existe: {Email}", botEmail);
            }
        }
    }

    // Debe ir ANTES de cualquier middleware que lea la IP (logging, rate limiter,
    // auditoría), o esos verán todavía la IP del proxy.
    app.UseForwardedHeaders();

    app.UseSerilogRequestLogging();
    app.UseStaticFiles();

    // Swagger documentaba toda la superficie de la API en producción sin ninguna
    // comprobación de entorno, y "/" redirigía ahí. Se habilita en desarrollo o
    // cuando se pide explícitamente con Swagger:Enabled=true.
    var swaggerEnabled = app.Environment.IsDevelopment()
                      || app.Configuration.GetValue<bool>("Swagger:Enabled");
    if (swaggerEnabled)
    {
        app.UseSwagger();
        app.UseSwaggerUI(c =>
        {
            c.SwaggerEndpoint("/swagger/v1/swagger.json", "TelecomBoliviaNet API v1");
            c.RoutePrefix = "swagger";
        });
    }

    app.UseExceptionHandler();

    app.Use(async (ctx, next) =>
    {
        ctx.Response.Headers["X-Frame-Options"]           = "DENY";
        ctx.Response.Headers["X-Content-Type-Options"]    = "nosniff";
        ctx.Response.Headers["Referrer-Policy"]           = "strict-origin-when-cross-origin";
        ctx.Response.Headers["X-XSS-Protection"]          = "0";
        ctx.Response.Headers["Content-Security-Policy"]   =
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:";
        if (!app.Environment.IsDevelopment())
        {
            ctx.Response.Headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
        }
        await next();
    });

    app.UseCors("Frontend");
    app.UseRateLimiter();
    app.UseAuthentication();
    app.UseMiddleware<TokenBlacklistMiddleware>();
    app.UseAuthorization();
    app.MapControllers();

    app.MapHub<AdminHub>("/hubs/admin").RequireCors("Frontend");

    app.MapGet("/", () => swaggerEnabled
        ? Results.Redirect("/swagger")
        : Results.Ok(new { service = "TelecomBoliviaNet API", status = "ok" }))
        .AllowAnonymous();

    app.MapGet("/health", () => Results.Ok(new { status = "healthy" })).AllowAnonymous();

    Log.Information("API lista · Swagger: http://localhost:5000/swagger");
    Log.Information("SignalR Hub: ws://localhost:5000/hubs/admin");
    await app.RunAsync();
}
catch (Exception ex)
{
    // Sin re-lanzar, el proceso terminaba con código de salida 0 y Docker/Railway
    // lo interpretaban como una parada limpia: el contenedor NO se reiniciaba y el
    // servicio quedaba caído indefinidamente tras un fallo de arranque.
    Log.Fatal(ex, "La aplicación terminó inesperadamente.");
    throw;
}
finally
{
    await Log.CloseAndFlushAsync();
}

public partial class Program { }
