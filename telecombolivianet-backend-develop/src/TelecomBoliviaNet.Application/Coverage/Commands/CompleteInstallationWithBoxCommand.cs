using MediatR;
using TelecomBoliviaNet.Domain.Entities.Coverage;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Coverage.Commands;

public record CompleteInstallationWithBoxCommand(
    Guid InstallationId,
    Guid DistributionBoxId) : IRequest<Result>;

public class CompleteInstallationWithBoxHandler
    : IRequestHandler<CompleteInstallationWithBoxCommand, Result>
{
    private readonly IGenericRepository<Installation>    _instRepo;
    private readonly IGenericRepository<DistributionBox> _boxRepo;

    public CompleteInstallationWithBoxHandler(
        IGenericRepository<Installation>    instRepo,
        IGenericRepository<DistributionBox> boxRepo)
    {
        _instRepo = instRepo;
        _boxRepo  = boxRepo;
    }

    public async Task<Result> Handle(
        CompleteInstallationWithBoxCommand cmd, CancellationToken ct)
    {
        var installation = await _instRepo.GetByIdAsync(cmd.InstallationId);
        if (installation is null)
            return Result.Failure("Instalación no encontrada.");

        if (installation.Status == InstallationStatus.Completada)
            return Result.Failure("La instalación ya está completada.");

        var box = await _boxRepo.GetByIdAsync(cmd.DistributionBoxId);
        if (box is null)
            return Result.Failure("Caja distribuidora no encontrada.");

        var reservedBoxId = installation.DistributionBoxId;
        if (reservedBoxId == box.Id)
        {
            // Consume la reserva propia hecha al agendar (F3).
            box.Ocupar();
        }
        else
        {
            // El técnico instaló en otra caja: libera la reserva original y
            // ocupa un puerto libre sin tocar reservas ajenas de la nueva.
            if (reservedBoxId is Guid oldId)
            {
                var oldBox = await _boxRepo.GetByIdAsync(oldId);
                if (oldBox is not null)
                {
                    oldBox.LiberarReserva();
                    _boxRepo.Update(oldBox);
                    await _boxRepo.SaveChangesAsync();
                }
            }
            box.OcuparPuertoLibre();
        }

        // Solo vincula la caja y ocupa el puerto; completar la instalación
        // (estado + ticket + SLA) es responsabilidad de
        // CompleteInstallationCommand, que el controller ejecuta después.
        installation.DistributionBoxId = box.Id;
        installation.ActualizadoAt     = DateTime.UtcNow;

        _boxRepo.Update(box);

        await _boxRepo.SaveChangesAsync();
        _instRepo.Update(installation);
        await _instRepo.SaveChangesAsync();
        return Result.Success();
    }
}
