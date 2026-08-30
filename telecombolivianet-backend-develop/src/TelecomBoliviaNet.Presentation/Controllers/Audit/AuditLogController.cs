using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.DTOs.Auth;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Presentation.Controllers;

namespace TelecomBoliviaNet.Presentation.Controllers.Audit;

[Route("api/audit-logs")]
[Authorize(Policy = "AdminOnly")]
public class AuditLogController : BaseController
{
    private readonly IAuditLogService _service;

    public AuditLogController(IAuditLogService service)
    {
        _service = service;
    }

    [HttpGet]
    // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
    // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
    // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Get([FromQuery] AuditLogFilterDto filter)
    {
        var result = await _service.GetAsync(filter);
        return OkResult(result);
    }

    [HttpGet("export")]
    // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
    // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
    // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Export([FromQuery] AuditLogFilterDto filter)
    {
        var csv = await _service.ExportCsvAsync(filter);
        var fileName = $"audit-log-{DateTime.UtcNow:yyyy-MM-dd}.csv";
        return File(csv, "text/csv; charset=utf-8", fileName);
    }
}
