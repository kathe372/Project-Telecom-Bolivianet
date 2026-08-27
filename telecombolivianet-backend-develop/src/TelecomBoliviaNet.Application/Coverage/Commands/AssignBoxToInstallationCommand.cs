using MediatR;
using Microsoft.Extensions.Logging;
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
    private readonly IUnitOfWork                         _uow;
    private readonly ILogger<AssignBoxToInstallationHandler> _logger;

    public AssignBoxToInstallationHandler(
        IGenericRepository<Installation>    instRepo,
        IGenericRepository<DistributionBox> boxRepo,
        IUnitOfWork                         uow,
        ILogger<AssignBoxToInstallationHandler> logger)
    {
        _instRepo = instRepo;
        _boxRepo  = boxRepo;
        _uow      = uow;
        _logger   = logger;
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

        // D-13 — Las tres escrituras son UNA operación: liberar el puerto de la
        // caja anterior, ocupar uno en la nueva y apuntar la instalación a esa.
        //
        // Antes cada una confirmaba por su cuenta. Si fallaba después de liberar
        // el puerto viejo, la caja anterior quedaba con un puerto libre de más y
        // la instalación seguía apuntando a ella: el mismo puerto figuraba a la
        // vez ocupado por un cliente y disponible para otro. Es contabilidad de
        // puertos corrupta en dos cajas a la vez, y no hay nada en pantalla que
        // lo delate.
        await _uow.BeginTransactionAsync(ct);
        try
        {
            if (installation.DistributionBoxId is not null)
            {
                var oldBox = await _boxRepo.GetByIdAsync(installation.DistributionBoxId.Value);
                if (oldBox is not null)
                {
                    oldBox.LiberarPuertoOcupado();
                    _boxRepo.Update(oldBox);
                }
            }

            newBox.Ocupar();
            installation.DistributionBoxId = newBox.Id;
            installation.ActualizadoAt     = DateTime.UtcNow;

            _boxRepo.Update(newBox);
            _instRepo.Update(installation);

            await _instRepo.SaveChangesAsync();
            await _uow.CommitAsync(ct);
        }
        catch (Exception ex)
        {
            await _uow.RollbackAsync(ct);
            _logger.LogError(ex,
                "Error al asignar la caja {BoxId} a la instalación {InstallationId} — " +
                "no se aplicó ningún cambio.", cmd.DistributionBoxId, cmd.InstallationId);
            return Result.Failure(
                "No se pudo asignar la caja. No se aplicó ningún cambio.");
        }

        return Result.Success();
    }
}
