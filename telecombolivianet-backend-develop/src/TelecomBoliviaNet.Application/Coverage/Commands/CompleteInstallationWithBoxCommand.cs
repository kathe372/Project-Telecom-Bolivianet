using MediatR;
using Microsoft.Extensions.Logging;
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
    private readonly IUnitOfWork                         _uow;
    private readonly ILogger<CompleteInstallationWithBoxHandler> _logger;

    public CompleteInstallationWithBoxHandler(
        IGenericRepository<Installation>    instRepo,
        IGenericRepository<DistributionBox> boxRepo,
        IUnitOfWork                         uow,
        ILogger<CompleteInstallationWithBoxHandler> logger)
    {
        _instRepo = instRepo;
        _boxRepo  = boxRepo;
        _uow      = uow;
        _logger   = logger;
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

        // D-13 — Soltar la reserva de una caja y ocupar puerto en otra son dos
        // mitades del mismo movimiento. Antes se confirmaban por separado: si
        // fallaba la segunda, la reserva original quedaba liberada y el cliente
        // sin puerto en ninguna caja, con el puerto viejo ya ofrecido a otro.
        await _uow.BeginTransactionAsync(ct);
        try
        {
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
            _instRepo.Update(installation);

            await _instRepo.SaveChangesAsync();
            await _uow.CommitAsync(ct);
        }
        catch (Exception ex)
        {
            await _uow.RollbackAsync(ct);
            _logger.LogError(ex,
                "Error al vincular la caja {BoxId} a la instalación {InstallationId} — " +
                "no se aplicó ningún cambio.", cmd.DistributionBoxId, cmd.InstallationId);
            return Result.Failure(
                "No se pudo vincular la caja. No se aplicó ningún cambio.");
        }

        return Result.Success();
    }
}
