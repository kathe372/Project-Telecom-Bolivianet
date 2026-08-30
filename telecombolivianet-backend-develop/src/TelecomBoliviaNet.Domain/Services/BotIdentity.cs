using System.Linq.Expressions;
using TelecomBoliviaNet.Domain.Entities.Auth;

namespace TelecomBoliviaNet.Domain.Services;

/// <summary>
/// Cómo se reconoce a la cuenta de servicio del chatbot.
/// </summary>
/// <remarks>
/// S-01 — Estaba escrito en dos sitios —<c>TicketsController.CanActOnTicketAsync</c>,
/// que decide en 9 endpoints si quien llama puede tocar un ticket, y
/// <c>GetUsersListHandler</c>, que lo oculta del listado de usuarios— y en los dos
/// **comparando su dirección de correo** contra una variable de entorno con un
/// valor por defecto escrito en el código.
///
/// <para>Eso hacía que un error de configuración quitara acceso <b>en silencio</b>:
/// si <c>SISTEMA_BOT_EMAIL</c> no está puesta y el correo real del bot no coincide
/// con el literal, el chatbot deja de poder actuar sobre tickets sin que falle el
/// arranque ni salte ningún aviso. Empieza a responder "Ticket no encontrado" en
/// conversaciones reales.</para>
///
/// <para><b>Lo correcto es el rol</b>, que existe desde F8.1 y no depende de
/// ninguna cadena de configuración.</para>
/// </remarks>
public static class BotIdentity
{
    /// <summary>
    /// Correo con el que se dio de alta el chatbot antes de que tuviera rol propio.
    /// </summary>
    public const string CorreoPorDefecto = "bot@telecombolivianet.bo";

    /// <summary>
    /// ¿Es la cuenta del chatbot?
    /// </summary>
    /// <remarks>
    /// <b>PUENTE TEMPORAL.</b> El rol es el criterio; la comparación por correo
    /// sigue aquí solo porque el usuario que YA existe en producción todavía tiene
    /// rol <c>Tecnico</c> —moverlo es un <c>UPDATE</c> condicionado a verificar el
    /// flujo por WhatsApp, ver PLAN_MEJORA_TECNICA_2026-08.md paso 8.1—.
    ///
    /// <para><b>Se borra el segundo bloque en cuanto ese UPDATE esté aplicado.</b>
    /// Hasta entonces quitarlo dejaría al chatbot sin acceso a tickets el mismo
    /// día del despliegue.</para>
    /// </remarks>
    public static bool EsElChatbot(UserRole rol, string? correo, string? correoConfigurado)
    {
        if (rol == UserRole.Bot) return true;

        // ── Puente: se retira con el UPDATE del rol en producción ──
        return rol == UserRole.Tecnico
            && !string.IsNullOrWhiteSpace(correo)
            && string.Equals(correo, correoConfigurado ?? CorreoPorDefecto,
                             StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// La misma regla, para filtrar en la base: cuentas que NO son el chatbot.
    /// </summary>
    /// <remarks>
    /// Se usa para que el chatbot no aparezca en el listado de usuarios del panel
    /// —es un servicio, no una persona—. Es la forma traducible a SQL de
    /// <see cref="EsElChatbot"/>; que digan lo mismo lo fija <c>BotIdentityTests</c>.
    /// </remarks>
    public static Expression<Func<UserSystem, bool>> NoEsElChatbot(string? correoConfigurado)
    {
        var correo = correoConfigurado ?? CorreoPorDefecto;
        return u => u.Role != UserRole.Bot
                 && !(u.Role == UserRole.Tecnico && u.Email.ToLower() == correo.ToLower());
    }
}
