using MediatR;
using TelecomBoliviaNet.Application.Coverage.Services;
using TelecomBoliviaNet.Application.DTOs.Coverage;

namespace TelecomBoliviaNet.Application.Coverage.Queries;

/// <summary>Puertos de una caja NAP (reconcilia el read-model y los devuelve).</summary>
public record GetBoxPortsQuery(Guid BoxId) : IRequest<IReadOnlyList<NapPortDto>>;

public class GetBoxPortsQueryHandler
    : IRequestHandler<GetBoxPortsQuery, IReadOnlyList<NapPortDto>>
{
    private readonly INapPortService _napPorts;

    public GetBoxPortsQueryHandler(INapPortService napPorts) => _napPorts = napPorts;

    public async Task<IReadOnlyList<NapPortDto>> Handle(GetBoxPortsQuery query, CancellationToken ct)
    {
        var ports = await _napPorts.GetBoxPortsAsync(query.BoxId, ct);
        return ports
            .Select(p => new NapPortDto(
                p.Numero, p.Status.ToString(), p.AccountId, p.OnuSerial, p.InstallationId, p.UpdatedAt))
            .ToList();
    }
}
