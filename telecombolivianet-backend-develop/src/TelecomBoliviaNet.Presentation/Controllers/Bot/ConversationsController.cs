using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TelecomBoliviaNet.Application.DTOs.Bot;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Bot;

namespace TelecomBoliviaNet.Presentation.Controllers.Bot;

[Route("api/conversaciones")]
[Authorize(Policy = "AdminOrOperadorOrTecnicoOrBot")]
public class ConversationsController : BaseController
{
    private readonly IBotMonitorProxy  _proxy;
    private readonly IBotRagProxy      _rag;
    private readonly IBotConfigService _config;
    private readonly CompanyQrService  _companyQr;

    public ConversationsController(
        IBotMonitorProxy  proxy,
        IBotRagProxy      rag,
        IBotConfigService config,
        CompanyQrService  companyQr)
    {
        _proxy     = proxy;
        _rag       = rag;
        _config    = config;
        _companyQr = companyQr;
    }


    [HttpGet]
    // F8.1 — Fijada explícitamente. Antes heredaba la de la clase; al
    // ampliar el piso de la clase para admitir al bot, heredarla la
    // habría abierto también a él sin que nadie lo decidiera.
    [Authorize(Policy = "AdminOrOperadorOrTecnico")]
    public async Task<IActionResult> GetConversaciones(
        [FromQuery] int    page          = 1,
        [FromQuery] int    limit         = 20,
        [FromQuery] bool   soloEscaladas = false,
        [FromQuery] string tab           = "todas")
    {
        var (items, total) = await _proxy.GetConversationsAsync(
            page, limit, soloEscaladas ? true : null, tab);
        return OkResult(new { Items = items, Total = total, Page = page, Limit = limit });
    }

    [HttpGet("{phone}")]
    // F8.1 — Fijada explícitamente. Antes heredaba la de la clase; al
    // ampliar el piso de la clase para admitir al bot, heredarla la
    // habría abierto también a él sin que nadie lo decidiera.
    [Authorize(Policy = "AdminOrOperadorOrTecnico")]
    public async Task<IActionResult> GetConversacion(string phone)
    {
        var detail = await _proxy.GetConversationByPhoneAsync(
            Uri.UnescapeDataString(phone), 100);
        return detail is null
            ? NotFoundResult("Conversación no encontrada.")
            : OkResult(detail);
    }

    [HttpGet("stats")]
    // F8.1 — Fijada explícitamente. Antes heredaba la de la clase; al
    // ampliar el piso de la clase para admitir al bot, heredarla la
    // habría abierto también a él sin que nadie lo decidiera.
    [Authorize(Policy = "AdminOrOperadorOrTecnico")]
    public async Task<IActionResult> GetStats()
        => OkResult(await _proxy.GetStatsAsync());


    [HttpGet("cliente/{phone}")]
    // F8.1 — Fijada explícitamente. Antes heredaba la de la clase; al
    // ampliar el piso de la clase para admitir al bot, heredarla la
    // habría abierto también a él sin que nadie lo decidiera.
    [Authorize(Policy = "AdminOrOperadorOrTecnico")]
    public async Task<IActionResult> GetClientHistory(string phone)
        => OkResult(await _proxy.GetClientHistoryAsync(
            Uri.UnescapeDataString(phone)));


    [HttpPost("{phone}/tomar")]
    // F8.1 — Fijada explícitamente. Antes heredaba la de la clase; al
    // ampliar el piso de la clase para admitir al bot, heredarla la
    // habría abierto también a él sin que nadie lo decidiera.
    [Authorize(Policy = "AdminOrOperadorOrTecnico")]
    public async Task<IActionResult> TakeoverConversacion(string phone)
    {
        var r = await _proxy.TakeoverConversationAsync(
            Uri.UnescapeDataString(phone), CurrentUserName);
        return r.EsExito
            ? OkMessage("Conversación tomada correctamente.")
            : SegunElBot(r, "No se pudo tomar la conversación. Puede que ya la tenga otro agente.",
                         "TAKEOVER_ERROR");
    }

    [HttpPost("{phone}/devolver")]
    // F8.1 — Fijada explícitamente. Antes heredaba la de la clase; al
    // ampliar el piso de la clase para admitir al bot, heredarla la
    // habría abierto también a él sin que nadie lo decidiera.
    [Authorize(Policy = "AdminOrOperadorOrTecnico")]
    public async Task<IActionResult> ReleaseConversacion(string phone)
    {
        var r = await _proxy.ReleaseConversationAsync(Uri.UnescapeDataString(phone));
        return r.EsExito
            ? OkMessage("Conversación devuelta al bot.")
            : SegunElBot(r, "No se pudo devolver la conversación al bot.", "RELEASE_ERROR");
    }

    [HttpPost("{phone}/responder")]
    // F8.1 — Fijada explícitamente. Antes heredaba la de la clase; al
    // ampliar el piso de la clase para admitir al bot, heredarla la
    // habría abierto también a él sin que nadie lo decidiera.
    [Authorize(Policy = "AdminOrOperadorOrTecnico")]
    public async Task<IActionResult> ResponderConversacion(
        string phone, [FromBody] SendMessageRequestDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Texto))
            return BadRequestResult("El texto del mensaje es requerido.");

        var r = await _proxy.SendAdminMessageAsync(
            Uri.UnescapeDataString(phone), dto.Texto);
        return r.EsExito
            ? OkMessage("Mensaje enviado correctamente.")
            : SegunElBot(r, "El chatbot rechazó el envío del mensaje.", "SEND_ERROR");
    }


    [HttpGet("~/api/bot-config")]
    // F8.1 — Fijada explícitamente. Antes heredaba la de la clase; al
    // ampliar el piso de la clase para admitir al bot, heredarla la
    // habría abierto también a él sin que nadie lo decidiera.
    [Authorize(Policy = "AdminOrOperadorOrTecnico")]
    public async Task<IActionResult> GetBotConfig()
        => OkResult(await _config.GetAsync());

    [HttpPut("~/api/bot-config")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> UpdateBotConfig([FromBody] UpdateBotConfigDto dto)
    {
        var result = await _config.UpdateAsync(
            dto.Config, CurrentUserId, CurrentUserName, ClientIp);
        return OkResult(result);
    }

    [HttpPost("~/api/bot-config/reset")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> ResetBotConfig()
    {
        var result = await _config.UpdateAsync(
            _config.GetDefault(), CurrentUserId, CurrentUserName, ClientIp);
        return OkResult(result);
    }

    [HttpGet("~/api/bot-config/public")]
    [Authorize(Policy = "AllRolesOrBot")]
    public async Task<IActionResult> GetBotConfigPublic()
        => OkResult(await _config.GetAsync());


    private static readonly string[] AllowedQrTypes = ["image/jpeg", "image/png", "image/webp"];

    [HttpPost("~/api/bot-config/company-qr")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> UploadCompanyQr(IFormFile file, [FromForm] string expiresAt)
    {
        if (file is null || file.Length == 0)
            return BadRequestResult("Archivo requerido.");
        if (!AllowedQrTypes.Contains(file.ContentType.ToLower()))
            return BadRequestResult("Formato no soportado. Use JPG, PNG o WebP.");
        if (file.Length > 5 * 1024 * 1024)
            return BadRequestResult("El archivo no puede superar 5 MB.");
        if (string.IsNullOrWhiteSpace(expiresAt))
            return BadRequestResult("La fecha de vencimiento del QR es obligatoria.");
        if (!DateOnly.TryParse(expiresAt, out var expiryDate) || expiryDate <= DateOnly.FromDateTime(DateTime.UtcNow))
            return BadRequestResult("La fecha de vencimiento debe ser una fecha futura válida (yyyy-MM-dd).");

        using var ms = new MemoryStream();
        await file.CopyToAsync(ms);
        var base64 = Convert.ToBase64String(ms.ToArray());

        await _companyQr.UploadAsync(base64, file.ContentType.ToLower(), expiryDate);

        return OkResult(new { expiresAt = expiryDate.ToString("yyyy-MM-dd") });
    }

    [HttpGet("~/api/bot-config/company-qr")]
    [Authorize(Policy = "AllRolesOrBot")]
    public async Task<IActionResult> GetCompanyQr()
    {
        var qr = await _companyQr.GetFileAsync();
        return qr is null
            ? NotFoundResult("No hay QR global configurado.")
            : File(qr.Bytes, qr.MimeType);
    }

    [HttpGet("~/api/bot-config/company-qr/info")]
    [Authorize(Policy = "AdminOrOperador")]
    public async Task<IActionResult> GetCompanyQrInfo()
        => OkResult(await _companyQr.GetInfoAsync());


    [HttpGet("~/api/rag/documents")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GetRagDocuments()
        => OkResult(await _rag.RagListDocumentsAsync());

    [HttpPost("~/api/rag/documents")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> UploadRagDocument(IFormFile file, [FromForm] string? title)
    {
        if (file is null || file.Length == 0)
            return BadRequestResult("Archivo requerido.");
        if (file.Length > 20 * 1024 * 1024)
            return BadRequestResult("El archivo no puede superar 20 MB.");

        var result = await _rag.RagUploadDocumentAsync(file, title);
        return result is null
            ? StatusCode(502, new { error = "Error al subir documento al chatbot.", code = "RAG_UPLOAD_ERROR" })
            : StatusCode(201, new { success = true, data = result });
    }

    [HttpDelete("~/api/rag/documents/{id}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> DeleteRagDocument(string id)
    {
        var r = await _rag.RagDeleteDocumentAsync(id);
        return r.EsExito
            ? NoContent()
            : SegunElBot(r, "El chatbot no pudo eliminar el documento. Puede que ya no exista.",
                         "RAG_DELETE_ERROR");
    }

    /// <summary>
    /// Traduce un fallo del chatbot a algo que le sirva a quien está delante.
    /// </summary>
    /// <remarks>
    /// OBS-02 — Antes las dos salidas eran el mismo 502 con el mismo texto, así
    /// que el operador no sabía si insistir. Ahora:
    ///
    /// <list type="bullet">
    /// <item><b>502</b> — el chatbot contestó y rechazó la operación. Insistir no
    /// cambia nada; el mensaje dice el motivo probable.</item>
    /// <item><b>503</b> — no se pudo hablar con el chatbot. La operación NO llegó
    /// a intentarse y en un minuto puede funcionar. Lleva <c>Retry-After</c>
    /// para que el navegador y el operador sepan a qué atenerse.</item>
    /// </list>
    ///
    /// La forma del cuerpo no cambia —<c>{ error, code }</c>— para que el panel
    /// siga mostrando el texto sin tocar nada.
    /// </remarks>
    private IActionResult SegunElBot(BotResult r, string siLoRechazo, string code)
    {
        if (!r.NoRespondio)
            return StatusCode(502, new { error = siLoRechazo, code });

        Response.Headers.RetryAfter = "30";
        return StatusCode(503, new
        {
            error = "El chatbot no está respondiendo, así que la operación no llegó a intentarse. "
                  + "Vuelve a intentarlo en un momento.",
            code  = "BOT_NO_DISPONIBLE",
        });
    }
}
