using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.DTOs.Bot;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Admin;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Services.Bot;

public class BotConfigService : IBotConfigService
{
    private const string CONFIG_KEY = "Bot:Config";

    private readonly IGenericRepository<SystemConfig> _sysRepo;
    private readonly AuditService                     _audit;
    private readonly ILogger<BotConfigService>        _logger;

    private static readonly BotConfigDto _default = new(
        Menu: new BotMenuDto(
            TituloMenu:    "¿En qué puedo ayudarte hoy?",
            TituloBoton:   "Ver opciones",
            TituloSeccion: "Servicios disponibles",
            Opciones: [
                new("1", "💳 Mi deuda",          "CONSULTA_DEUDA",        true,  "Consultar facturas pendientes",     SoloCliente: true),
                new("2", "📲 Pagar con QR",       "SOLICITAR_QR",          true,  "Obtener código de pago",            SoloCliente: true),
                new("3", "🔧 Soporte técnico",    "SIN_CONEXION",          true,  "Reportar problemas de conexión",    SoloCliente: true),
                new("4", "📅 Instalación",         "SOLICITAR_INSTALACION", true,  "Agendar o consultar visita",        SoloCliente: false),
                new("5", "📋 Información",         "CONSULTA_PLANES",       true,  "Planes, precios y cobertura",       SoloCliente: false),
                new("6", "👤 Hablar con agente",   "SOLICITAR_AGENTE",      true,  "Atención personalizada",            SoloCliente: false),
            ]),
        Horario: new BotScheduleDto(
            "08:00", "20:00",
            [true, true, true, true, true, false, false],
            "Nuestro horario de atención es de lunes a viernes de 8:00 a 20:00. " +
            "Puedes dejar tu consulta y te responderemos al inicio del próximo día hábil."),
        Mensajes: new BotMensajesDto(
            Bienvenida:          "¡Hola {nombre}! 👋 Soy el asistente virtual de *TelecomBoliviaNet*. ¿En qué puedo ayudarte?",
            BienvenidaProspecto: "¡Hola! 👋 Soy el asistente virtual de *TelecomBoliviaNet*. ¿Ya eres cliente o deseas información sobre nuestros planes?",
            NoEntendido:         "Disculpa, no entendí tu consulta. ¿Puedes reformularla o elegir una opción del menú?",
            EscaladoAgente:      "Te estoy conectando con un agente de soporte. Un momento por favor... 🔄")
    );

    public BotConfigService(
        IGenericRepository<SystemConfig> sysRepo,
        AuditService                     audit,
        ILogger<BotConfigService>        logger)
    {
        _sysRepo = sysRepo;
        _audit   = audit;
        _logger  = logger;
    }

    public async Task<BotConfigDto> GetAsync()
    {
        var cfg = await _sysRepo.GetAll()
            .FirstOrDefaultAsync(c => c.Key == CONFIG_KEY);

        if (cfg is null || string.IsNullOrWhiteSpace(cfg.Value))
            return _default;

        try
        {
            var parsed = JsonSerializer.Deserialize<BotConfigDto>(cfg.Value)!;
            return parsed with
            {
                Menu = parsed.Menu with
                {
                    Opciones      = parsed.Menu?.Opciones ?? [],
                    TituloBoton   = string.IsNullOrWhiteSpace(parsed.Menu?.TituloBoton)   ? "Ver opciones"          : parsed.Menu.TituloBoton,
                    TituloSeccion = string.IsNullOrWhiteSpace(parsed.Menu?.TituloSeccion) ? "Servicios disponibles" : parsed.Menu.TituloSeccion,
                },
                Horario = parsed.Horario with
                {
                    DiasActivos = parsed.Horario?.DiasActivos
                                  ?? [true, true, true, true, true, false, false]
                },
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex,
                "Config del bot almacenada (key {ConfigKey}) no se pudo deserializar — " +
                "se usa la configuración por defecto.", CONFIG_KEY);
            return _default;
        }
    }

    public async Task<BotConfigDto> UpdateAsync(
        BotConfigDto dto, Guid actorId, string actorName, string ip)
    {
        var cfg = await _sysRepo.GetAll()
            .FirstOrDefaultAsync(c => c.Key == CONFIG_KEY);

        var json    = JsonSerializer.Serialize(dto);
        var prevVal = cfg?.Value ?? "(default)";

        if (cfg is null)
        {
            await _sysRepo.AddAsync(new SystemConfig
            {
                Key         = CONFIG_KEY,
                Value       = json,
                Description = "Configuración del chatbot WhatsApp",
            });
            await _sysRepo.SaveChangesAsync();
        }
        else
        {
            cfg.Value     = json;
            cfg.UpdatedAt = DateTime.UtcNow;
            _sysRepo.Update(cfg);
            await _sysRepo.SaveChangesAsync();
        }

        await _audit.LogAsync("Chatbot", "BOT_CONFIG_UPDATED",
            "Configuración del bot actualizada",
            userId: actorId, userName: actorName, ip: ip,
            prevData: prevVal, newData: json);

        return dto;
    }

    public BotConfigDto GetDefault() => _default;
}
