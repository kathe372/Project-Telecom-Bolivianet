using TelecomBoliviaNet.Application.Interfaces;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.DTOs.Bot;
using TelecomBoliviaNet.Domain.ValueObjects;

namespace TelecomBoliviaNet.Application.Services.Bot;

/// <summary>
/// El panel de conversaciones del chatbot. Ver <see cref="BotProxyBase"/> para
/// qué ocurre cuando el chatbot no responde.
/// </summary>
public class BotMonitorProxy : BotProxyBase, IBotMonitorProxy
{
    public BotMonitorProxy(
        IHttpClientFactory        httpFactory,
        IConfiguration            cfg,
        ILogger<BotMonitorProxy>  log)
        : base(httpFactory, cfg, log) { }

    public Task<(List<ConversationListItemDto> Items, int Total)> GetConversationsAsync(
        int page = 1, int limit = 20, bool? soloEscaladas = null, string tab = "todas")
        => SinRomperElPanelAsync(
            (new List<ConversationListItemDto>(), 0),
            async () =>
            {
                var url = soloEscaladas == true
                    ? "monitor/conversations/escalated"
                    : $"monitor/conversations?page={page}&limit={limit}&tab={Uri.EscapeDataString(tab)}";

                var res = await _http.SendAsync(Auth(HttpMethod.Get, url));
                res.EnsureSuccessStatusCode();
                var raw   = await res.Content.ReadFromJsonAsync<JsonElement>();
                var total = raw.TryGetProperty("total", out var t) ? t.GetInt32() : 0;
                return (ParseConversationList(raw), total);
            },
            "BotProxy: error al obtener conversaciones");

    public Task<ConversationDetailDto?> GetConversationByPhoneAsync(
        string phone, int msgLimit = 50)
        => SinRomperElPanelAsync<ConversationDetailDto?>(
            null,
            async () =>
            {
                var url = $"monitor/conversations/{Uri.EscapeDataString(phone)}?limit={msgLimit}";
                var res = await _http.SendAsync(Auth(HttpMethod.Get, url));
                res.EnsureSuccessStatusCode();
                var raw = await res.Content.ReadFromJsonAsync<JsonElement>();

                if (!raw.TryGetProperty("found", out var found) || !found.GetBoolean())
                    return null;

                var conv = raw.GetProperty("conversation");
                var msgs = raw.TryGetProperty("messages", out var m) ? m : default;

                return new ConversationDetailDto(
                    conv.GetProperty("id").GetString()!,
                    conv.GetProperty("phoneNumber").GetString()!,
                    conv.TryGetProperty("clientId",    out var cid)  ? cid.GetString()  : null,
                    conv.TryGetProperty("clientName",  out var cname)? cname.GetString(): null,
                    conv.TryGetProperty("isEscalated", out var esc)  ? esc.GetBoolean() : false,
                    conv.TryGetProperty("agentName",   out var ag)   ? ag.GetString()   : null,
                    ParseMessages(msgs),
                    conv.TryGetProperty("updatedAt",   out var up)   ? up.GetString()   : null,
                    conv.TryGetProperty("createdAt",   out var ca)   ? ca.GetString()   : null);
            },
            "BotProxy: error al obtener conversación {Phone}", phone);

    /// <summary>
    /// El historial que se muestra en la ficha del cliente. No lleva su propio
    /// manejo de errores porque se apoya en <see cref="GetConversationByPhoneAsync"/>,
    /// que ya devuelve null si el bot no responde.
    /// </summary>
    public async Task<ClientConversationHistoryDto> GetClientHistoryAsync(string phone)
    {
        var normalized = NormalizeBolivianPhone(phone);
        var detail = await GetConversationByPhoneAsync(normalized, 200);
        if (detail is null)
            return new ClientConversationHistoryDto(phone, new List<ConversationListItemDto>());

        var item = new ConversationListItemDto(
            detail.Id, detail.PhoneNumber, detail.ClientId, detail.ClientName,
            detail.IsEscalated, detail.AgentName, null,
            detail.UpdatedAt ?? DateTime.UtcNow.ToString("o"),
            detail.CreatedAt ?? DateTime.UtcNow.ToString("o"),
            detail.Messages.LastOrDefault()?.Content, detail.Messages.Count);

        return new ClientConversationHistoryDto(phone,
            new List<ConversationListItemDto> { item });
    }

    public Task<ConversationStatsDto> GetStatsAsync()
        => SinRomperElPanelAsync(
            new ConversationStatsDto(0, 0, 0, 0),
            async () =>
            {
                var res = await _http.SendAsync(Auth(HttpMethod.Get, "monitor/stats"));
                res.EnsureSuccessStatusCode();
                var raw   = await res.Content.ReadFromJsonAsync<JsonElement>();
                var total = raw.GetProperty("total");
                var today = raw.GetProperty("today");
                return new ConversationStatsDto(
                    total.GetProperty("conversations").GetInt32(),
                    total.GetProperty("escalated").GetInt32(),
                    today.GetProperty("conversations").GetInt32(),
                    today.GetProperty("messages").GetInt32());
            },
            "BotProxy: error al obtener stats del chatbot");

    public Task<BotResult> TakeoverConversationAsync(string phone, string agentName)
        => IntentarAsync(
            async () =>
            {
                var req = Auth(HttpMethod.Post,
                    $"monitor/conversations/{Uri.EscapeDataString(phone)}/takeover");
                req.Content = JsonContent.Create(new { agentName });
                var res = await _http.SendAsync(req);
                return res.IsSuccessStatusCode;
            },
            "BotProxy: error al tomar conversación {Phone}", phone);

    public Task<BotResult> ReleaseConversationAsync(string phone)
        => IntentarAsync(
            async () =>
            {
                var req = Auth(HttpMethod.Post,
                    $"monitor/conversations/{Uri.EscapeDataString(phone)}/release");
                var res = await _http.SendAsync(req);
                return res.IsSuccessStatusCode;
            },
            "BotProxy: error al devolver conversación {Phone}", phone);

    public Task<BotResult> SendAdminMessageAsync(string phone, string text)
        => IntentarAsync(
            async () =>
            {
                var req = Auth(HttpMethod.Post,
                    $"monitor/conversations/{Uri.EscapeDataString(phone)}/send");
                req.Content = JsonContent.Create(new { text });
                var res = await _http.SendAsync(req);
                return res.IsSuccessStatusCode;
            },
            "BotProxy: error al enviar mensaje admin a {Phone}", phone);

    /// <summary>
    /// D1 (2026-08-07): antes esto AGREGABA el prefijo "591". El chatbot guarda
    /// y busca por el número LOCAL de 8 dígitos, así que cada llamada con
    /// prefijo no encontraba la conversación. Ver PhoneNumber.ToLocalCanonical.
    /// </summary>
    private static string NormalizeBolivianPhone(string phone)
        => PhoneNumber.ToLocalCanonical(phone);


    private static List<ConversationListItemDto> ParseConversationList(JsonElement raw)
    {
        if (!raw.TryGetProperty("conversations", out var arr)
            || arr.ValueKind != JsonValueKind.Array)
            return new();
        return arr.EnumerateArray().Select(ParseConvItem).ToList();
    }

    private static ConversationListItemDto ParseConvItem(JsonElement c) => new(
        c.GetProperty("id").GetString()!,
        c.GetProperty("phoneNumber").GetString()!,
        c.TryGetProperty("clientId",      out var ci)  ? ci.GetString()   : null,
        c.TryGetProperty("clientName",    out var cn)  ? cn.GetString()   : null,
        c.TryGetProperty("isEscalated",   out var es)  ? es.GetBoolean()  : false,
        c.TryGetProperty("agentName",     out var ag)  ? ag.GetString()   : null,
        c.TryGetProperty("escalatedAt",   out var eat) ? eat.GetString()  : null,
        c.TryGetProperty("updatedAt",     out var up)  ? up.GetString()!  : "",
        c.TryGetProperty("createdAt",     out var ca)  ? ca.GetString()!  : "",
        c.TryGetProperty("ultimoMensaje", out var um)  ? um.GetString()   : null,
        c.TryGetProperty("totalMessages", out var tm)  ? tm.GetInt32()    : 0);

    private static List<ConversationMessageDto> ParseMessages(JsonElement msgs)
    {
        if (msgs.ValueKind != JsonValueKind.Array) return new();
        return msgs.EnumerateArray().Select(m => new ConversationMessageDto(
            m.GetProperty("id").GetString()!,
            m.GetProperty("role").GetString()!,
            m.TryGetProperty("source",    out var src) ? src.GetString()  : null,
            m.GetProperty("content").GetString()!,
            m.GetProperty("createdAt").GetString()!,
            m.TryGetProperty("mediaUrl",  out var mu)  ? mu.GetString()   : null,
            m.TryGetProperty("mediaType", out var mt)  ? mt.GetString()   : null
        )).ToList();
    }
}
