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
    private readonly IValidator<CreatePlanDto> _createVal;
    private readonly IValidator<UpdatePlanDto> _updateVal;

    public PlansController(
        IPlanService service,
        IValidator<CreatePlanDto> createVal,
        IValidator<UpdatePlanDto> updateVal)
    {
        _service   = service;
        _createVal = createVal;
        _updateVal = updateVal;
    }

    [HttpGet]
    [Authorize(Policy = "AllRoles")]
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
        var v = await _createVal.ValidateAsync(dto);
        if (!v.IsValid)
            return BadRequest(new { success = false, errors = v.Errors.Select(e => e.ErrorMessage) });

        var result = await _service.CreateAsync(dto, CurrentUserId, CurrentUserName, ClientIp);
        if (!result.IsSuccess) return BadRequestResult(result.ErrorMessage);
        return StatusCode(201, new { success = true, data = result.Value });
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdatePlanDto dto)
    {
        var v = await _updateVal.ValidateAsync(dto);
        if (!v.IsValid)
            return BadRequest(new { success = false, errors = v.Errors.Select(e => e.ErrorMessage) });

        var result = await _service.UpdateAsync(id, dto, CurrentUserId, CurrentUserName, ClientIp);
        if (!result.IsSuccess) return BadRequestResult(result.ErrorMessage);
        return OkResult(result.Value!);
    }

    [HttpGet("{id:guid}/history")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GetHistory(Guid id)
        => OkResult(await _service.GetHistoryAsync(id));
}
