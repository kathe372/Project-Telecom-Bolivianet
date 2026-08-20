using MediatR;
using TelecomBoliviaNet.Application.Coverage.Services;
using TelecomBoliviaNet.Application.DTOs.Coverage;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Coverage.Queries;

/// <summary>
/// Consulta de cobertura por DIRECCIÓN de texto (no GPS). Geocodifica la dirección
/// y delega en <see cref="CheckCoverageQuery"/> — así el motor de cobertura y el log
/// de demanda quedan intactos (SRP). Channel/contacto se propagan al log de demanda.
/// </summary>
public record CheckCoverageByAddressQuery(
    string Address,
    string? Channel = null, string? ContactPhone = null, string? ContactName = null)
    : IRequest<Result<CheckCoverageByAddressResponseDto>>;

public class CheckCoverageByAddressQueryHandler
    : IRequestHandler<CheckCoverageByAddressQuery, Result<CheckCoverageByAddressResponseDto>>
{
    private readonly IAddressGeocodingService _geocoding;
    private readonly IMediator                _mediator;

    public CheckCoverageByAddressQueryHandler(
        IAddressGeocodingService geocoding,
        IMediator                mediator)
    {
        _geocoding = geocoding;
        _mediator  = mediator;
    }

    public async Task<Result<CheckCoverageByAddressResponseDto>> Handle(
        CheckCoverageByAddressQuery query, CancellationToken ct)
    {
        var geo = await _geocoding.ResolveAsync(query.Address, ct);
        if (geo is null)
            return Result<CheckCoverageByAddressResponseDto>.Failure(
                "No pudimos ubicar esa dirección. Probá con una más específica o compartí tu ubicación GPS.");

        var coverage = await _mediator.Send(new CheckCoverageQuery(
            geo.Lat, geo.Lng, query.Channel, query.ContactPhone, query.ContactName), ct);
        if (!coverage.IsSuccess)
            return Result<CheckCoverageByAddressResponseDto>.Failure(coverage.ErrorMessage);

        return Result<CheckCoverageByAddressResponseDto>.Success(
            new CheckCoverageByAddressResponseDto(
                geo.Lat, geo.Lng, geo.Confidence, geo.DisplayName, coverage.Value!));
    }
}
