using System.Globalization;
using MediatR;
using TelecomBoliviaNet.Application.DTOs.Installations;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Installations.Queries;

/// <summary>
/// Eventos del calendario de instalaciones dentro de un rango de fechas
/// (inclusive), opcionalmente filtrados por técnico. Reutiliza
/// <see cref="InstallationListItemDto"/> (con DuracionMin/TecnicoId) para que el
/// frontend y los modales de acción compartan el mismo tipo. No pagina: el rango
/// acota el volumen. Ver PLAN_CALENDARIO.md (Fase 0).
/// </summary>
public record GetCalendarEventsQuery(string Desde, string Hasta, Guid? TecnicoId = null)
    : IRequest<IReadOnlyList<InstallationListItemDto>>;

public class GetCalendarEventsHandler
    : IRequestHandler<GetCalendarEventsQuery, IReadOnlyList<InstallationListItemDto>>
{
    private readonly IInstallationRepository _instRepo;

    public GetCalendarEventsHandler(IInstallationRepository instRepo)
        => _instRepo = instRepo;

    public async Task<IReadOnlyList<InstallationListItemDto>> Handle(
        GetCalendarEventsQuery req, CancellationToken ct)
    {
        var desde = ParseDateUtc(req.Desde, nameof(req.Desde));
        var hasta = ParseDateUtc(req.Hasta, nameof(req.Hasta));

        if (hasta < desde)
            throw new DomainException("'hasta' no puede ser anterior a 'desde'.");

        var items = await _instRepo.GetCalendarRangeAsync(desde, hasta, req.TecnicoId, ct);

        return items.Select(InstallationMapper.ToListItem).ToList();
    }

    /// <summary>
    /// Parsea `yyyy-MM-dd` y lo normaliza a Kind=Utc (Npgsql exige UTC para
    /// timestamptz). Fecha mal formada → DomainException → 400 controlado.
    /// </summary>
    private static DateTime ParseDateUtc(string value, string field)
    {
        if (!DateTime.TryParseExact(value, "yyyy-MM-dd",
                CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
            throw new DomainException($"Formato de fecha inválido en '{field}' (use yyyy-MM-dd).");

        return DateTime.SpecifyKind(parsed.Date, DateTimeKind.Utc);
    }
}
