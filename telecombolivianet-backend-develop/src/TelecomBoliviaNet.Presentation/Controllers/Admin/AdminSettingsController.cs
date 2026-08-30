using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Admin;
using TelecomBoliviaNet.Presentation.Controllers;

namespace TelecomBoliviaNet.Presentation.Controllers.Admin;

[Route("api/admin/settings")]
[Authorize(Policy = "AdminOnly")]
public class AdminSettingsController : BaseController
{
    private readonly IAdminSettingsService _svc;

    public AdminSettingsController(IAdminSettingsService svc) => _svc = svc;

    [HttpGet]
    // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
    // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
    // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Get() => OkResult(await _svc.GetCurrentAsync());

    [HttpPut]
    // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
    // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
    // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Save([FromBody] AdminSettingsDto dto)
    {
        var result = await _svc.SaveAsync(dto, CurrentUserId, CurrentUserName, ClientIp);
        return result.IsSuccess
            ? OkMessage("Configuración guardada y aplicada correctamente.")
            : BadRequestResult(result.ErrorMessage!);
    }
}
