using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Coverage.Commands;
using TelecomBoliviaNet.Application.DTOs.Installations;
using TelecomBoliviaNet.Application.Installations.Commands;
using TelecomBoliviaNet.Application.Installations.Queries;
using TelecomBoliviaNet.Application.Installations.Services;
using TelecomBoliviaNet.Application.Utils;
using TelecomBoliviaNet.Presentation.Controllers;

namespace TelecomBoliviaNet.Presentation.Controllers.Installations;

[Route("api/instalaciones")]
[Authorize(Policy = "AdminOrTecnico")]
public class InstallationsController : BaseController
{
    private readonly IMediator                _mediator;
    private readonly IInstallationPhotoService _photos;

    public InstallationsController(IMediator mediator, IInstallationPhotoService photos)
    {
        _mediator = mediator;
        _photos   = photos;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] InstallationFilterDto filter)
        => OkResult(await _mediator.Send(new GetInstallationsListQuery(filter)));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var detalle = await _mediator.Send(new GetInstallationDetailQuery(id));
        return detalle is null
            ? NotFoundResult("Instalación no encontrada.")
            : OkResult(detalle);
    }

    [HttpPost]
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> Create([FromBody] CreateInstallationDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Fecha))
            return BadRequestResult("La fecha es obligatoria.");
        if (string.IsNullOrWhiteSpace(dto.HoraInicio))
            return BadRequestResult("La hora de inicio es obligatoria.");
        if (string.IsNullOrWhiteSpace(dto.Direccion))
            return BadRequestResult("La dirección es obligatoria.");

        var result = await _mediator.Send(
            new CreateInstallationCommand(dto, CurrentUserId, CurrentUserName, ClientIp));
        if (!result.IsSuccess) return BadRequestResult(result.ErrorMessage!);

        return StatusCode(201, new { success = true, data = result.Value });
    }

    [HttpPost("admin")]
    public async Task<IActionResult> CreateAdmin([FromBody] CreateInstallationAdminDto dto)
    {
        var result = await _mediator.Send(
            new CreateInstallationAdminCommand(dto, CurrentUserId, CurrentUserName, ClientIp));
        if (!result.IsSuccess) return BadRequestResult(result.ErrorMessage!);

        return StatusCode(201, new { success = true, data = result.Value });
    }

    [HttpPatch("{id:guid}/cancelar")]
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> Cancel(Guid id, [FromBody] CancelInstallationDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.MotivoCancelacion))
            return BadRequestResult("El motivo de cancelación es obligatorio.");

        var result = await _mediator.Send(
            new CancelInstallationCommand(id, dto, CurrentUserId, CurrentUserName, ClientIp));
        return result.IsSuccess
            ? OkMessage("Instalación cancelada correctamente.")
            : BadRequestResult(result.ErrorMessage!);
    }

    [HttpPatch("{id:guid}/reprogramar")]
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> Reschedule(Guid id, [FromBody] RescheduleInstallationDto dto)
    {
        var result = await _mediator.Send(
            new RescheduleInstallationCommand(id, dto, CurrentUserId, CurrentUserName, ClientIp));
        return result.IsSuccess
            ? OkMessage("Instalación reprogramada correctamente.")
            : BadRequestResult(result.ErrorMessage!);
    }

    // La visita ocurrió pero no se pudo instalar (cliente ausente, etc.).
    [HttpPatch("{id:guid}/no-realizada")]
    public async Task<IActionResult> MarkNoShow(Guid id, [FromBody] NoShowDto dto)
    {
        var result = await _mediator.Send(new MarkInstallationNoShowCommand(
            id, dto.Motivo, CurrentUserId, CurrentUserName, ClientIp));
        return result.IsSuccess
            ? OkMessage("Instalación marcada como no realizada.")
            : BadRequestResult(result.ErrorMessage!);
    }

    // Regulariza clientes existentes: asigna o reasigna la caja NAP de una
    // instalación ya completada (libera el puerto de la caja anterior).
    [HttpPatch("{id:guid}/caja")]
    public async Task<IActionResult> AssignBox(Guid id, [FromBody] AssignBoxDto dto)
    {
        var result = await _mediator.Send(
            new AssignBoxToInstallationCommand(id, dto.DistributionBoxId));
        return result.IsSuccess
            ? OkMessage("Caja NAP asignada correctamente.")
            : BadRequestResult(result.ErrorMessage!);
    }

    // Sube una foto de evidencia de la instalación (F5). Devuelve la URL
    // pública; el frontend acumula las URLs y las envía al completar.
    [HttpPost("{id:guid}/fotos")]
    public async Task<IActionResult> UploadPhoto(Guid id, IFormFile file)
    {
        if (file is null || file.Length == 0)
            return BadRequestResult("Debes adjuntar un archivo.");
        if (file.Length > 5 * 1024 * 1024)
            return BadRequestResult("La foto no puede superar 5 MB.");

        var allowed = new[] { "image/jpeg", "image/png", "image/webp" };
        if (!allowed.Contains(file.ContentType.ToLower()))
            return BadRequestResult("Formato no permitido. Use JPG, PNG o WebP.");

        using var stream = file.OpenReadStream();
        if (!await FileValidator.IsMagicBytesValidAsync(stream, file.ContentType))
            return BadRequestResult("El contenido del archivo no coincide con su extensión declarada.");

        var result = await _photos.UploadAsync(
            id, stream, FileValidator.SanitizeFileName(file.FileName));

        return result.IsSuccess
            ? OkResult(new { Url = result.Value })
            : BadRequestResult(result.ErrorMessage!);
    }

    [HttpPatch("{id:guid}/completar")]
    public async Task<IActionResult> Complete(Guid id, [FromBody] CompleteInstallationDto dto)
    {
        if (dto.DistributionBoxId.HasValue)
        {
            var boxResult = await _mediator.Send(
                new CompleteInstallationWithBoxCommand(id, dto.DistributionBoxId.Value));
            if (!boxResult.IsSuccess) return BadRequestResult(boxResult.ErrorMessage!);
        }

        var result = await _mediator.Send(
            new CompleteInstallationCommand(id, dto, CurrentUserId, CurrentUserName, ClientIp));
        return result.IsSuccess
            ? OkMessage("Instalación completada. El ticket fue resuelto automáticamente.")
            : BadRequestResult(result.ErrorMessage!);
    }
}
