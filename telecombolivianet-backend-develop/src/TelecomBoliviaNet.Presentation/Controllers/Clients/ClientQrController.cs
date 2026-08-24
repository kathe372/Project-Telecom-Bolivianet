using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.DTOs.Clients;
using TelecomBoliviaNet.Application.Services.Clients;
using TelecomBoliviaNet.Presentation.Controllers;

namespace TelecomBoliviaNet.Presentation.Controllers.Clients;

[Route("api/clients/{clientId:guid}/qr")]
public class ClientQrController : BaseController
{
    private readonly IClientQrService _svc;

    public ClientQrController(IClientQrService svc) => _svc = svc;


    [HttpGet]
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> GetQrImage(Guid clientId)
    {
        var (_, bytes, contentType) = await _svc.GetActiveQrAsync(clientId);

        if (bytes is null || contentType is null)
            return NotFoundResult("El cliente no tiene un QR activo o ha expirado.");

        return File(bytes, contentType);
    }


    [HttpGet("info")]
    [Authorize(Policy = "AdminOrTecnico")]
    public async Task<IActionResult> GetQrInfo(Guid clientId)
    {
        var (dto, _, _) = await _svc.GetActiveQrAsync(clientId);
        if (dto is null)
            return NotFoundResult("El cliente no tiene un QR activo.");
        return OkResult(dto);
    }


    [HttpGet("history")]
    [Authorize(Policy = "AdminOrTecnico")]
    public async Task<IActionResult> GetHistory(Guid clientId)
    {
        var historial = await _svc.GetHistorialAsync(clientId);
        return OkResult(historial);
    }


    [HttpPost]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> UploadQr(
        Guid clientId,
        IFormFile file,
        [FromForm] UpdateClientQrDto meta)
    {
        var result = await _svc.UploadQrAsync(
            clientId, file, meta,
            CurrentUserId, CurrentUserName, ClientIp);

        if (!result.IsSuccess)
            return BadRequestResult(result.ErrorMessage!);

        return StatusCode(201, new { success = true, data = result.Value });
    }
}
