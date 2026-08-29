namespace TelecomBoliviaNet.Domain.Entities.Auth;

public enum UserRole
{
    Admin,
    Operador,
    Tecnico,
    SocioLectura,

    /// <summary>
    /// El chatbot de WhatsApp. Es un servicio, no una persona.
    /// </summary>
    /// <remarks>
    /// F8.1 — Hasta ahora el chatbot entraba con rol <see cref="Tecnico"/>, así que
    /// podía todo lo que un técnico humano: listar y crear clientes, registrar
    /// cobros, ver la caja, asignar técnicos, cerrar tickets. Su credencial vive en
    /// las variables de entorno de otro servicio; si se filtra, se filtra todo eso.
    ///
    /// <para>Con rol propio llega exactamente a los 22 endpoints que usa y a
    /// ninguno más. Cuáles son no se dedujo: se leyeron uno a uno de
    /// <c>SistemaApiService</c>, el único cliente HTTP vivo del chatbot.</para>
    ///
    /// <para>No es un rol asignable desde el panel — ver <c>CreateUserCommand</c>.</para>
    /// </remarks>
    Bot
}
