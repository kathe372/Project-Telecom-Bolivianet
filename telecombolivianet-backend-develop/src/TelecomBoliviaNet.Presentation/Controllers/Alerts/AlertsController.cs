using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Presentation.Controllers;

namespace TelecomBoliviaNet.Presentation.Controllers.Alerts;

[Route("api/alerts")]
[Authorize(Policy = "AllRoles")]
public class AlertsController : BaseController
{
    private readonly IInternalAlertService _alertSvc;

    public AlertsController(IInternalAlertService alertSvc) => _alertSvc = alertSvc;

    [HttpGet]
    // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
    // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
    // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> GetUnread()
        => OkResult(await _alertSvc.GetUnreadAsync(CurrentUserId, CurrentUserRole));

    [HttpPatch("{id:guid}/read")]
    // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
    // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
    // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> MarkRead(Guid id)
    {
        await _alertSvc.MarkReadAsync(id);
        return OkResult(new { });
    }

    [HttpPatch("read-all")]
    // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
    // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
    // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> MarkAllRead()
    {
        await _alertSvc.MarkAllReadAsync(CurrentUserId, CurrentUserRole);
        return OkResult(new { });
    }
}
