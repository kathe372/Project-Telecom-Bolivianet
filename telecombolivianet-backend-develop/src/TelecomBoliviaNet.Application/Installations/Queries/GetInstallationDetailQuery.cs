using MediatR;
using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Application.DTOs.Installations;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Installations.Queries;

public record GetInstallationDetailQuery(Guid Id)
    : IRequest<InstallationDetailDto?>;

public class GetInstallationDetailHandler
    : IRequestHandler<GetInstallationDetailQuery, InstallationDetailDto?>
{
    private readonly IGenericRepository<Installation> _instRepo;

    public GetInstallationDetailHandler(IGenericRepository<Installation> instRepo)
        => _instRepo = instRepo;

    public async Task<InstallationDetailDto?> Handle(
        GetInstallationDetailQuery req, CancellationToken ct)
    {
        var inst = await _instRepo.GetAll()
            .Include(i => i.Client)
            .Include(i => i.Plan)
            .Include(i => i.Tecnico)
            .Include(i => i.DistributionBox)
            .Include(i => i.Technicians).ThenInclude(t => t.Technician)
            .FirstOrDefaultAsync(i => i.Id == req.Id, ct);

        return inst is null ? null : InstallationMapper.ToDetail(inst);
    }
}
