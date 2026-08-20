using MediatR;
using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Application.DTOs.Coverage;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Coverage.Queries;

/// <summary>
/// Ubicaciones GPS de los clientes para la capa de "casas" del mapa de
/// cobertura, con la caja NAP asignada (vía su instalación completada).
/// </summary>
public record GetClientLocationsQuery : IRequest<IReadOnlyList<ClientLocationDto>>;

public class GetClientLocationsHandler
    : IRequestHandler<GetClientLocationsQuery, IReadOnlyList<ClientLocationDto>>
{
    private readonly IGenericRepository<Client>       _clientRepo;
    private readonly IGenericRepository<Installation> _instRepo;

    public GetClientLocationsHandler(
        IGenericRepository<Client>       clientRepo,
        IGenericRepository<Installation> instRepo)
    {
        _clientRepo = clientRepo;
        _instRepo   = instRepo;
    }

    public async Task<IReadOnlyList<ClientLocationDto>> Handle(
        GetClientLocationsQuery req, CancellationToken ct)
    {
        var clients = await _clientRepo.GetAllReadOnly()
            .Where(c => c.GpsLatitude != null && c.GpsLongitude != null)
            .Select(c => new { c.Id, c.TbnCode, c.FullName, c.Status, c.GpsLatitude, c.GpsLongitude })
            .ToListAsync(ct);

        var boxByClient = await _instRepo.GetAllReadOnly()
            .Where(i => i.Status == InstallationStatus.Completada
                     && i.DistributionBoxId != null
                     && i.ClientId != null)
            .Include(i => i.DistributionBox)
            .GroupBy(i => i.ClientId!.Value)
            .Select(g => new
            {
                ClientId  = g.Key,
                BoxCodigo = g.OrderByDescending(i => i.CreadoAt)
                             .Select(i => i.DistributionBox!.Codigo)
                             .First(),
            })
            .ToDictionaryAsync(x => x.ClientId, x => x.BoxCodigo, ct);

        return clients.Select(c => new ClientLocationDto(
            c.Id,
            c.TbnCode,
            c.FullName,
            c.Status.ToString(),
            (double)c.GpsLatitude!.Value,
            (double)c.GpsLongitude!.Value,
            boxByClient.TryGetValue(c.Id, out var codigo) ? codigo : null
        )).ToList();
    }
}
