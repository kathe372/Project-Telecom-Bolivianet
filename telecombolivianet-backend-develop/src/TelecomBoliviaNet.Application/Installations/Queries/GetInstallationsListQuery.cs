using MediatR;
using Microsoft.EntityFrameworkCore;
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
    private readonly IGenericRepository<Installation> _instRepo;

    public GetInstallationsListHandler(IGenericRepository<Installation> instRepo)
        => _instRepo = instRepo;

    public async Task<PagedResult<InstallationListItemDto>> Handle(
        GetInstallationsListQuery req, CancellationToken ct)
    {
        var f     = req.Filter;
        var query = _instRepo.GetAll()
            .Include(i => i.Client)
            .Include(i => i.Plan)
            .Include(i => i.Tecnico)
            .Include(i => i.DistributionBox)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(f.Status) &&
            Enum.TryParse<InstallationStatus>(f.Status, out var st))
            query = query.Where(i => i.Status == st);

        if (f.TecnicoId.HasValue)
            query = query.Where(i => i.TecnicoId == f.TecnicoId);

        if (f.ClienteId.HasValue)
            query = query.Where(i => i.ClientId == f.ClienteId);

        // Pipeline de recontacto (F6): prospectos con teléfono, aún no
        // convertidos a cliente — típicamente Cancelada/NoRealizada.
        if (f.SoloProspectos == true)
            query = query.Where(i => i.ClientId == null && i.ProspectPhone != null);

        if (!string.IsNullOrWhiteSpace(f.Fecha) && DateTime.TryParse(f.Fecha, out var fdParsed))
        {
            // Npgsql exige Kind=Utc para parámetros timestamptz; TryParse
            // devuelve Kind=Unspecified y la consulta explota con 500.
            var fd = DateTime.SpecifyKind(fdParsed.Date, DateTimeKind.Utc);
            query = query.Where(i => i.Fecha.Date == fd);
        }

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderBy(i => i.Fecha).ThenBy(i => i.HoraInicio)
            .Skip((f.Page - 1) * f.PageSize)
            .Take(f.PageSize)
            .ToListAsync(ct);

        return new PagedResult<InstallationListItemDto>(
            items.Select(InstallationMapper.ToListItem),
            total, f.Page, f.PageSize);
    }
}
