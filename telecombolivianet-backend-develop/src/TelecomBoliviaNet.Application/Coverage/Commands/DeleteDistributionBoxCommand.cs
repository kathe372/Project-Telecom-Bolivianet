using MediatR;
using TelecomBoliviaNet.Domain.Entities.Coverage;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Coverage.Commands;

public record DeleteDistributionBoxCommand(Guid Id) : IRequest<Result>;

public class DeleteDistributionBoxHandler : IRequestHandler<DeleteDistributionBoxCommand, Result>
{
    private readonly IGenericRepository<DistributionBox> _boxRepo;

    public DeleteDistributionBoxHandler(IGenericRepository<DistributionBox> boxRepo)
        => _boxRepo = boxRepo;

    public async Task<Result> Handle(DeleteDistributionBoxCommand cmd, CancellationToken ct)
    {
        var box = await _boxRepo.GetByIdAsync(cmd.Id);
        if (box is null)
            return Result.Failure("Caja distribuidora no encontrada.");

        if (box.PuertosReservados > 0)
            return Result.Failure(
                $"La caja tiene {box.PuertosReservados} instalación(es) reservada(s). " +
                "Cancele las instalaciones pendientes antes de eliminar la caja.");

        box.Estado = DistributionBoxStatus.Mantenimiento;
        _boxRepo.Update(box);
        await _boxRepo.SaveChangesAsync();
        return Result.Success();
    }
}
