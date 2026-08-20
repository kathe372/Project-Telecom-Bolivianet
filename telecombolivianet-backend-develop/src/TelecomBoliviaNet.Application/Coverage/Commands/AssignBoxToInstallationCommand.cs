using MediatR;
using TelecomBoliviaNet.Domain.Entities.Coverage;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Coverage.Commands;

/// <summary>
/// Asigna (o reasigna) la caja NAP de una instalación ya completada.
/// Permite regularizar clientes existentes que se instalaron antes de que
/// el panel registrara la caja. Al reasignar, libera el puerto de la caja
/// anterior y ocupa uno en la nueva.
/// </summary>
public record AssignBoxToInstallationCommand(
    Guid InstallationId,
    Guid DistributionBoxId) : IRequest<Result>;

public class AssignBoxToInstallationHandler
    : IRequestHandler<AssignBoxToInstallationCommand, Result>
{
    private readonly IGenericRepository<Installation>    _instRepo;
    private readonly IGenericRepository<DistributionBox> _boxRepo;

    public AssignBoxToInstallationHandler(
        IGenericRepository<Installation>    instRepo,
        IGenericRepository<DistributionBox> boxRepo)
    {
        _instRepo = instRepo;
        _boxRepo  = boxRepo;
    }

    public async Task<Result> Handle(
        AssignBoxToInstallationCommand cmd, CancellationToken ct)
    {
        var installation = await _instRepo.GetByIdAsync(cmd.InstallationId);
        if (installation is null)
            return Result.Failure("Instalación no encontrada.");

        if (installation.Status != InstallationStatus.Completada)
            return Result.Failure(
                "Solo se puede asignar caja a instalaciones completadas. " +
                "Para instalaciones pendientes, la caja se elige al completarlas.");

        if (installation.DistributionBoxId == cmd.DistributionBoxId)
            return Result.Success();

        var newBox = await _boxRepo.GetByIdAsync(cmd.DistributionBoxId);
        if (newBox is null)
            return Result.Failure("Caja distribuidora no encontrada.");

        // Reasignación: devolver el puerto a la caja anterior.
        if (installation.DistributionBoxId is not null)
        {
            var oldBox = await _boxRepo.GetByIdAsync(installation.DistributionBoxId.Value);
            if (oldBox is not null)
            {
                oldBox.LiberarPuertoOcupado();
                await _boxRepo.UpdateAsync(oldBox);
            }
        }

        newBox.Ocupar();
        installation.DistributionBoxId = newBox.Id;
        installation.ActualizadoAt     = DateTime.UtcNow;

        await _boxRepo.UpdateAsync(newBox);
        await _instRepo.UpdateAsync(installation);
        return Result.Success();
    }
}
