using MediatR;
using TelecomBoliviaNet.Application.DTOs.Common;
using TelecomBoliviaNet.Application.DTOs.Installations;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Installations.Queries;

public record GetInstallationsListQuery(InstallationFilterDto Filter)
    : IRequest<PagedResult<InstallationListItemDto>>;

public class GetInstallationsListHandler
    : IRequestHandler<GetInstallationsListQuery, PagedResult<InstallationListItemDto>>
{
    private readonly IInstallationRepository _instRepo;

    public GetInstallationsListHandler(IInstallationRepository instRepo)
        => _instRepo = instRepo;

    public async Task<PagedResult<InstallationListItemDto>> Handle(
        GetInstallationsListQuery req, CancellationToken ct)
    {
        var f     = req.Filter;
        // Traducir el DTO de la API (strings sin parsear) a los criterios que
        // entiende el repositorio es trabajo del caso de uso: es quien sabe qué
        // significa un filtro vacío o una fecha mal escrita.
        InstallationStatus? status = null;
        if (!string.IsNullOrWhiteSpace(f.Status) &&
            Enum.TryParse<InstallationStatus>(f.Status, out var st))
            status = st;

        DateTime? fecha = null;
        if (!string.IsNullOrWhiteSpace(f.Fecha) && DateTime.TryParse(f.Fecha, out var fdParsed))
            fecha = fdParsed.Date;

        var (items, total) = await _instRepo.GetPagedAsync(
            new InstallationListFilter(
                status, fecha, f.TecnicoId, f.ClienteId,
                f.SoloProspectos == true, f.Page, f.PageSize),
            ct);

        return new PagedResult<InstallationListItemDto>(
            items.Select(InstallationMapper.ToListItem),
            total, f.Page, f.PageSize);
    }
}
