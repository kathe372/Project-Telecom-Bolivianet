using TelecomBoliviaNet.Application.DTOs.Bot;
using Microsoft.AspNetCore.Http;

namespace TelecomBoliviaNet.Application.Interfaces;

/// <summary>
/// El panel de conversaciones del chatbot: qué está pasando y cómo interviene un
/// humano.
/// </summary>
public interface IBotMonitorProxy
{
    Task<(List<ConversationListItemDto> Items, int Total)> GetConversationsAsync(
        int page = 1, int limit = 20, bool? soloEscaladas = null, string tab = "todas");

    Task<ConversationDetailDto?> GetConversationByPhoneAsync(string phone, int msgLimit = 50);

    Task<ClientConversationHistoryDto> GetClientHistoryAsync(string phone);

    Task<ConversationStatsDto> GetStatsAsync();

    /// <summary>Un agente humano toma la conversación y el bot deja de responder.</summary>
    Task<bool> TakeoverConversationAsync(string phone, string agentName);

    /// <summary>El agente la devuelve al bot.</summary>
    Task<bool> ReleaseConversationAsync(string phone);

    /// <summary>Mensaje escrito por un agente dentro de una conversación.</summary>
    Task<bool> SendAdminMessageAsync(string phone, string text);
}

/// <summary>Documentos que alimentan el RAG del chatbot.</summary>
public interface IBotRagProxy
{
    Task<object?> RagListDocumentsAsync();

    Task<object?> RagUploadDocumentAsync(IFormFile file, string? title);

    Task<bool> RagDeleteDocumentAsync(string id);
}

/// <summary>
/// Avisos que el backend le pide al chatbot que entregue por su cuenta.
///
/// <para>Va aparte del panel a propósito: quien manda un recordatorio de
/// instalación no tiene por qué depender de los siete métodos del monitor. Antes
/// era una sola interfaz de once métodos y cuatro de sus cinco consumidores
/// usaban exactamente uno (F5).</para>
/// </summary>
public interface IBotOutboundProxy
{
    /// <summary>
    /// Envía por WhatsApp la confirmación de instalación del día siguiente con
    /// botones interactivos (Confirmar / Reagendar) vía el chatbot.
    /// </summary>
    Task<bool> SendInstallationConfirmationAsync(
        string phone, string nombre, string fecha, string hora, string direccion);

    /// <summary>
    /// 2026-08-05: le avisa al chatbot que la identidad cacheada para este
    /// teléfono (cliente/prospecto) puede estar desactualizada — se llama al
    /// guardar un cambio de PhoneMain/PhoneSecondary de un cliente, para que
    /// la sesión de WhatsApp de ese número se re-verifique en el próximo
    /// mensaje en vez de esperar hasta 2 horas (el re-check periódico sigue
    /// existiendo como red de seguridad si esta llamada falla).
    /// </summary>
    Task<bool> InvalidateIdentityAsync(string phone);
}
