using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TelecomBoliviaNet.Application.DTOs.Bot;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Bot;

namespace TelecomBoliviaNet.Presentation.Controllers.Bot;

[Route("api/conversaciones")]
[Authorize(Policy = "AdminOrOperadorOrTecnico")]
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
    public async Task<IActionResult> GetConversacion(string phone)
    {
        var detail = await _proxy.GetConversationByPhoneAsync(
            Uri.UnescapeDataString(phone), 100);
        return detail is null
            ? NotFoundResult("Conversación no encontrada.")
            : OkResult(detail);
    }

    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
        => OkResult(await _proxy.GetStatsAsync());


    [HttpGet("cliente/{phone}")]
    public async Task<IActionResult> GetClientHistory(string phone)
        => OkResult(await _proxy.GetClientHistoryAsync(
            Uri.UnescapeDataString(phone)));


    [HttpPost("{phone}/tomar")]
    public async Task<IActionResult> TakeoverConversacion(string phone)
    {
        var ok = await _proxy.TakeoverConversationAsync(
            Uri.UnescapeDataString(phone), CurrentUserName);
        return ok
            ? OkMessage("Conversación tomada correctamente.")
            : StatusCode(502, new { error = "Error al tomar la conversación.", code = "TAKEOVER_ERROR" });
    }

    [HttpPost("{phone}/devolver")]
    public async Task<IActionResult> ReleaseConversacion(string phone)
    {
        var ok = await _proxy.ReleaseConversationAsync(Uri.UnescapeDataString(phone));
        return ok
            ? OkMessage("Conversación devuelta al bot.")
            : StatusCode(502, new { error = "Error al devolver la conversación.", code = "RELEASE_ERROR" });
    }

    [HttpPost("{phone}/responder")]
    public async Task<IActionResult> ResponderConversacion(
        string phone, [FromBody] SendMessageRequestDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Texto))
            return BadRequestResult("El texto del mensaje es requerido.");

        var ok = await _proxy.SendAdminMessageAsync(
            Uri.UnescapeDataString(phone), dto.Texto);
        return ok
            ? OkMessage("Mensaje enviado correctamente.")
            : StatusCode(502, new { error = "Error al enviar el mensaje.", code = "SEND_ERROR" });
    }


    [HttpGet("~/api/bot-config")]
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
    [Authorize(Policy = "AllRoles")]
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
    [Authorize(Policy = "AllRoles")]
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
        var ok = await _rag.RagDeleteDocumentAsync(id);
        return ok ? NoContent() : StatusCode(502, new { error = "Error al eliminar documento.", code = "RAG_DELETE_ERROR" });
    }
}
