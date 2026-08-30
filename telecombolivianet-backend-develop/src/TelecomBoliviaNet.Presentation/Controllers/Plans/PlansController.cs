using FluentValidation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.DTOs.Plans;
using TelecomBoliviaNet.Application.Services.Plans;
using TelecomBoliviaNet.Presentation.Controllers;

namespace TelecomBoliviaNet.Presentation.Controllers.Plans;

[Route("api/plans")]
public class PlansController : BaseController
{
    private readonly IPlanService _service;

    public PlansController(
        IPlanService service
)
    {
        _service   = service;
    }

    [HttpGet]
    [Authorize(Policy = "AllRolesOrBot")]
    public async Task<IActionResult> GetAll([FromQuery] bool onlyActive = false)
    {
        var plans = await _service.GetAllAsync(onlyActive);
        return OkResult(plans);
    }

    [HttpGet("{id:guid}")]
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var plan = await _service.GetByIdAsync(id);
        if (plan is null) return NotFoundResult("Plan no encontrado.");
        return OkResult(plan);
    }

    [HttpPost]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Create([FromBody] CreatePlanDto dto)
    {

        var result = await _service.CreateAsync(dto, CurrentUserId, CurrentUserName, ClientIp);
        if (!result.IsSuccess) return BadRequestResult(result.ErrorMessage);
        return StatusCode(201, new { success = true, data = result.Value });
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdatePlanDto dto)
    {

        var result = await _service.UpdateAsync(id, dto, CurrentUserId, CurrentUserName, ClientIp);
        if (!result.IsSuccess) return BadRequestResult(result.ErrorMessage);
        return OkResult(result.Value!);
    }

    [HttpGet("{id:guid}/history")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GetHistory(Guid id)
        => OkResult(await _service.GetHistoryAsync(id));
}
