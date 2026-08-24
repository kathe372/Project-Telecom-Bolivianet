using System.Globalization;
using MediatR;
using TelecomBoliviaNet.Application.DTOs.Installations;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Installations.Queries;

/// <summary>
/// Visitas de tickets (soporte técnico, recolección de equipo, cambio de
/// plan, etc.) dentro de un rango de fechas, para superponerlas -en modo
/// solo lectura- sobre el calendario de instalaciones. Reutiliza
/// <see cref="AgendaItemDto"/>, el mismo tipo que ya usa "Mi Agenda".
/// </summary>
public record GetTicketCalendarVisitsQuery(string Desde, string Hasta, Guid? TecnicoId = null)
    : IRequest<IReadOnlyList<AgendaItemDto>>;

public class GetTicketCalendarVisitsHandler
    : IRequestHandler<GetTicketCalendarVisitsQuery, IReadOnlyList<AgendaItemDto>>
{
    private readonly ITicketVisitRepository _visitRepo;

    public GetTicketCalendarVisitsHandler(ITicketVisitRepository visitRepo)
        => _visitRepo = visitRepo;

    public async Task<IReadOnlyList<AgendaItemDto>> Handle(
        GetTicketCalendarVisitsQuery req, CancellationToken ct)
    {
        var desde = ParseDateUtc(req.Desde, nameof(req.Desde));
        var hasta = ParseDateUtc(req.Hasta, nameof(req.Hasta));

        if (hasta < desde)
            throw new DomainException("'hasta' no puede ser anterior a 'desde'.");

        // Solo visitas pendientes (Programada) de tickets todavia Abierto o
        // EnProceso: si el ticket ya se resolvio/cerro por otro canal, o esta
        // en pausa esperando al cliente, ya no debe seguir ocupando el
        // calendario aunque la visita nunca se haya cancelado explicitamente.
        var visits = await _visitRepo.GetCalendarRangeAsync(desde, hasta, req.TecnicoId, ct);

        return visits.Where(v => v.Ticket is not null).Select(v =>
        {
            var t = v.Ticket!;
            return new AgendaItemDto(
                Id:            v.Id,
                Type:          t.Type.ToString(),
                ClienteNombre: t.Client?.FullName ?? t.ProspectName ?? "—",
                Fecha:         v.ScheduledAt.ToString("yyyy-MM-dd"),
                HoraInicio:    v.ScheduledAt.ToString("HH:mm"),
                HoraFin:       v.ScheduledAt.AddMinutes(v.DuracionMin).ToString("HH:mm"),
                Direccion:     t.Client?.Street ?? t.Client?.Zone ?? "Sin dirección registrada",
                Status:        v.Status.ToString(),
                ClientePhone:  t.Client?.PhoneMain ?? t.ProspectPhone,
                PlanNombre:    t.Client?.Plan?.Name,
                Notas:         v.Observations ?? t.Subject,
                MapsLink:      InstallationMapper.BuildMapsLink(t.Client?.GpsLatitude, t.Client?.GpsLongitude),
                TecnicoId:     v.TechnicianId,
                TicketId:      t.Id
            );
        }).ToList();
    }

    private static DateTime ParseDateUtc(string value, string field)
    {
        if (!DateTime.TryParseExact(value, "yyyy-MM-dd",
                CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
            throw new DomainException($"Formato de fecha inválido en '{field}' (use yyyy-MM-dd).");

        return DateTime.SpecifyKind(parsed.Date, DateTimeKind.Utc);
    }
}
