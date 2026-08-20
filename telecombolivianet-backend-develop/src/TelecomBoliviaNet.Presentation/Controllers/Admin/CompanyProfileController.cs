using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TelecomBoliviaNet.Application.DTOs.Admin;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Presentation.Controllers;

namespace TelecomBoliviaNet.Presentation.Controllers.Admin;

/// <summary>
/// Datos de la empresa que encabezan los reportes exportados (NIT, dirección,
/// logo, color de marca). Editables sin desplegar.
/// </summary>
[Route("api/admin/company-profile")]
public class CompanyProfileController : BaseController
{
    /// <summary>Un logo razonable en base64 no pasa de ~700 KB; más que eso hincha cada PDF.</summary>
    private const int MaxLogoBase64Length = 700_000;

    private readonly ICompanyProfileService _svc;

    public CompanyProfileController(ICompanyProfileService svc) => _svc = svc;

    [HttpGet]
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> Get() => OkResult(await _svc.GetAsync());

    [HttpPut]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Save([FromBody] CompanyProfileDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Name))
            return BadRequestResult("El nombre de la empresa es obligatorio.");

        if (dto.LogoBase64 is { Length: > MaxLogoBase64Length })
            return BadRequestResult("El logo es demasiado grande. Usa una imagen de menos de 500 KB.");

        var saved = await _svc.UpdateAsync(dto, CurrentUserId, CurrentUserName, ClientIp);
        return OkResult(saved);
    }
}
