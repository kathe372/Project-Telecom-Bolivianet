using TelecomBoliviaNet.Application.DTOs.Bot;
using Microsoft.AspNetCore.Http;

namespace TelecomBoliviaNet.Application.Interfaces;

public interface IBotProxyService
{
    Task<(List<ConversationListItemDto> Items, int Total)> GetConversationsAsync(
        int page = 1, int limit = 20, bool? soloEscaladas = null, string tab = "todas");
    Task<ConversationDetailDto?>  GetConversationByPhoneAsync(string phone, int msgLimit = 50);
    Task<ClientConversationHistoryDto> GetClientHistoryAsync(string phone);
    Task<ConversationStatsDto>    GetStatsAsync();

    Task<object?>  RagListDocumentsAsync();
    Task<object?>  RagUploadDocumentAsync(IFormFile file, string? title);
    Task<bool>     RagDeleteDocumentAsync(string id);

    Task<bool> TakeoverConversationAsync(string phone, string agentName);
    Task<bool> ReleaseConversationAsync(string phone);
    Task<bool> SendAdminMessageAsync(string phone, string text);

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
