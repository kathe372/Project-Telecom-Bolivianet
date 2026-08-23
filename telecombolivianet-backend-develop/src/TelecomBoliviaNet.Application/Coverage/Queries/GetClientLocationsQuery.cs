using MediatR;
using TelecomBoliviaNet.Application.DTOs.Coverage;
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
    private readonly IClientRepository       _clientRepo;
    private readonly IInstallationRepository _instRepo;

    public GetClientLocationsHandler(
        IClientRepository       clientRepo,
        IInstallationRepository instRepo)
    {
        _clientRepo = clientRepo;
        _instRepo   = instRepo;
    }

    public async Task<IReadOnlyList<ClientLocationDto>> Handle(
        GetClientLocationsQuery req, CancellationToken ct)
    {
        // Las dos consultas viven ahora en sus repositorios: la proyección de
        // clientes con GPS y el "código de caja de la instalación más reciente".
        // El handler solo compone el DTO.
        var clients     = await _clientRepo.GetWithGpsAsync(ct);
        var boxByClient = await _instRepo.GetLatestBoxCodeByClientAsync(ct);

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
