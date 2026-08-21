using MediatR;
using TelecomBoliviaNet.Application.DTOs.Coverage;
using TelecomBoliviaNet.Domain.Entities.Coverage;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Coverage.Commands;

public record UpdateDistributionBoxCommand(
    Guid                      Id,
    UpdateDistributionBoxRequest Request) : IRequest<Result<DistributionBoxDto>>;

public class UpdateDistributionBoxHandler
    : IRequestHandler<UpdateDistributionBoxCommand, Result<DistributionBoxDto>>
{
    private readonly IGenericRepository<DistributionBox> _boxRepo;

    public UpdateDistributionBoxHandler(IGenericRepository<DistributionBox> boxRepo)
        => _boxRepo = boxRepo;

    public async Task<Result<DistributionBoxDto>> Handle(
        UpdateDistributionBoxCommand cmd, CancellationToken ct)
    {
        var box = await _boxRepo.GetByIdAsync(cmd.Id);
        if (box is null)
            return Result<DistributionBoxDto>.Failure("Caja distribuidora no encontrada.");

        if (!Enum.TryParse<DistributionBoxStatus>(cmd.Request.Estado, out var estado))
            return Result<DistributionBoxDto>.Failure($"Estado inválido: {cmd.Request.Estado}");

        if (cmd.Request.PuertosTotal < cmd.Request.PuertosOcupados + box.PuertosReservados)
            return Result<DistributionBoxDto>.Failure(
                "PuertosTotal no puede ser menor que la suma de puertos ocupados y reservados.");

        box.Codigo                  = cmd.Request.Codigo;
        box.DireccionReferencia     = cmd.Request.DireccionReferencia;
        box.PuertosTotal            = cmd.Request.PuertosTotal;
        box.PuertosOcupados         = cmd.Request.PuertosOcupados;
        box.DistanciaMaxCableMetros = cmd.Request.DistanciaMaxCableMetros;
        box.Estado                  = estado;

        // Reubicación del pin en el mapa (F7)
        if (cmd.Request is { Lat: double lat, Lng: double lng })
            box.Location = new NetTopologySuite.Geometries.Point(lng, lat) { SRID = 4326 };

        _boxRepo.Update(box);

        await _boxRepo.SaveChangesAsync();
        return Result<DistributionBoxDto>.Success(new DistributionBoxDto(
            box.Id, box.Codigo, box.DireccionReferencia, box.ZoneId, string.Empty,
            box.Location.Y, box.Location.X,
            box.PuertosTotal, box.PuertosOcupados, box.PuertosReservados,
            box.PuertosTotal - box.PuertosOcupados - box.PuertosReservados,
            box.DistanciaMaxCableMetros, box.Estado.ToString()));
    }
}
