using TelecomBoliviaNet.Application.DTOs.Admin;

namespace TelecomBoliviaNet.Application.Interfaces;

public interface ICompanyProfileService
{
    /// <summary>Perfil guardado, o los valores por defecto si nunca se configuró.</summary>
    Task<CompanyProfileDto> GetAsync();

    Task<CompanyProfileDto> UpdateAsync(CompanyProfileDto dto, Guid actorId, string actorName, string ip);

    CompanyProfileDto GetDefault();
}
