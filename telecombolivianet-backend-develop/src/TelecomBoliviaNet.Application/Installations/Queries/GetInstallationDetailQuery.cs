using MediatR;
using TelecomBoliviaNet.Application.DTOs.Installations;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Installations.Queries;

public record GetInstallationDetailQuery(Guid Id)
    : IRequest<InstallationDetailDto?>;

public class GetInstallationDetailHandler
    : IRequestHandler<GetInstallationDetailQuery, InstallationDetailDto?>
{
    private readonly IInstallationRepository _instRepo;

    public GetInstallationDetailHandler(IInstallationRepository instRepo)
        => _instRepo = instRepo;

    public async Task<InstallationDetailDto?> Handle(
        GetInstallationDetailQuery req, CancellationToken ct)
    {
        var inst = await _instRepo.GetDetailAsync(req.Id, ct);

        return inst is null ? null : InstallationMapper.ToDetail(inst);
    }
}
