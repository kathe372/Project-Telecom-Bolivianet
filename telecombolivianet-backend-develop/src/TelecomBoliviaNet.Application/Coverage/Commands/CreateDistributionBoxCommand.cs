using MediatR;
using NetTopologySuite.Geometries;
using TelecomBoliviaNet.Application.DTOs.Coverage;
using TelecomBoliviaNet.Domain.Entities.Coverage;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Coverage.Commands;

public record CreateDistributionBoxCommand(
    CreateDistributionBoxRequest Request) : IRequest<Result<DistributionBoxDto>>;

public class CreateDistributionBoxHandler
    : IRequestHandler<CreateDistributionBoxCommand, Result<DistributionBoxDto>>
{
    private readonly IGenericRepository<DistributionBox> _boxRepo;
    private readonly IGenericRepository<CoverageZone>    _zoneRepo;

    public CreateDistributionBoxHandler(
        IGenericRepository<DistributionBox> boxRepo,
        IGenericRepository<CoverageZone>    zoneRepo)
    {
        _boxRepo  = boxRepo;
        _zoneRepo = zoneRepo;
    }

    public async Task<Result<DistributionBoxDto>> Handle(
        CreateDistributionBoxCommand cmd, CancellationToken ct)
    {
        if (await _boxRepo.AnyAsync(b => b.Codigo == cmd.Request.Codigo))
            return Result<DistributionBoxDto>.Failure(
                $"Ya existe una caja con el código '{cmd.Request.Codigo}'.");

        var zone = await _zoneRepo.GetByIdAsync(cmd.Request.ZoneId);
        if (zone is null)
            return Result<DistributionBoxDto>.Failure("Zona de cobertura no encontrada.");

        var location = new Point(cmd.Request.Lng, cmd.Request.Lat) { SRID = 4326 };

        var box = new DistributionBox
        {
            Codigo                  = cmd.Request.Codigo,
            DireccionReferencia     = cmd.Request.DireccionReferencia,
            ZoneId                  = cmd.Request.ZoneId,
            Location                = location,
            PuertosTotal            = cmd.Request.PuertosTotal,
            PuertosOcupados         = 0,
            PuertosReservados       = 0,
            DistanciaMaxCableMetros = cmd.Request.DistanciaMaxCableMetros,
            Estado                  = DistributionBoxStatus.Activo,
            CreadoAt                = DateTime.UtcNow,
        };

        await _boxRepo.AddAsync(box);
        await _boxRepo.SaveChangesAsync();
        return Result<DistributionBoxDto>.Success(ToDto(box, zone.Nombre));
    }

    private static DistributionBoxDto ToDto(DistributionBox b, string zoneName) =>
        new(b.Id, b.Codigo, b.DireccionReferencia, b.ZoneId, zoneName,
            b.Location.Y, b.Location.X,
            b.PuertosTotal, b.PuertosOcupados, b.PuertosReservados,
            b.PuertosTotal - b.PuertosOcupados - b.PuertosReservados,
            b.DistanciaMaxCableMetros, b.Estado.ToString());
}
