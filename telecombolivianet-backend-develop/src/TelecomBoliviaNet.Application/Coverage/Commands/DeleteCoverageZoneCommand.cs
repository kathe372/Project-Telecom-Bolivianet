using MediatR;
using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Domain.Entities.Coverage;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Coverage.Commands;

public record DeleteCoverageZoneCommand(Guid Id) : IRequest<Result>;

public class DeleteCoverageZoneHandler : IRequestHandler<DeleteCoverageZoneCommand, Result>
{
    private readonly IGenericRepository<CoverageZone>    _zoneRepo;
    private readonly IGenericRepository<DistributionBox> _boxRepo;

    public DeleteCoverageZoneHandler(
        IGenericRepository<CoverageZone>    zoneRepo,
        IGenericRepository<DistributionBox> boxRepo)
    {
        _zoneRepo = zoneRepo;
        _boxRepo  = boxRepo;
    }

    public async Task<Result> Handle(DeleteCoverageZoneCommand cmd, CancellationToken ct)
    {
        var zone = await _zoneRepo.GetByIdAsync(cmd.Id);
        if (zone is null)
            return Result.Failure("Zona de cobertura no encontrada.");

        var hasActiveBoxes = await _boxRepo.AnyAsync(
            b => b.ZoneId == cmd.Id && b.Estado == DistributionBoxStatus.Activo);
        if (hasActiveBoxes)
            return Result.Failure(
                "No se puede eliminar la zona porque tiene cajas distribuidoras activas. " +
                "Cambie el estado de las cajas a Mantenimiento primero.");

        zone.Estado = CoverageZoneStatus.Inactiva;
        await _zoneRepo.UpdateAsync(zone);
        return Result.Success();
    }
}
