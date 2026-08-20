using MediatR;
using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Application.DTOs.Installations;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Installations.Queries;

public record GetTechnicianAgendaQuery(Guid TecnicoId, string Fecha)
    : IRequest<TechnicianAgendaDto?>;

public class GetTechnicianAgendaHandler
    : IRequestHandler<GetTechnicianAgendaQuery, TechnicianAgendaDto?>
{
    private readonly IGenericRepository<Installation> _instRepo;
    private readonly IGenericRepository<TicketVisit>  _visitRepo;
    private readonly IGenericRepository<UserSystem>   _userRepo;

    public GetTechnicianAgendaHandler(
        IGenericRepository<Installation> instRepo,
        IGenericRepository<TicketVisit>  visitRepo,
        IGenericRepository<UserSystem>   userRepo)
    {
        _instRepo  = instRepo;
        _visitRepo = visitRepo;
        _userRepo  = userRepo;
    }

    public async Task<TechnicianAgendaDto?> Handle(
        GetTechnicianAgendaQuery req, CancellationToken ct)
    {
        if (!DateOnly.TryParseExact(req.Fecha, "yyyy-MM-dd", out var fecha))
            return null;

        var tecnico = await _userRepo.GetByIdAsync(req.TecnicoId);
        if (tecnico is null) return null;

        var targetDate = fecha.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);

        var installations = await _instRepo.GetAll()
            .Include(i => i.Client)
            .Include(i => i.Plan)
            .Where(i => i.Fecha.Date == targetDate.Date
                     && (i.TecnicoId == req.TecnicoId
                         || i.Technicians.Any(t => t.TechnicianId == req.TecnicoId))
                     && i.Status != InstallationStatus.Cancelada)
            .OrderBy(i => i.HoraInicio)
            .ToListAsync(ct);

        var installationItems = installations.Select(i => new AgendaItemDto(
            Id:            i.Id,
            Type:          "Instalacion",
            ClienteNombre: InstallationMapper.DisplayName(i),
            Fecha:         i.Fecha.ToString("yyyy-MM-dd"),
            HoraInicio:    i.HoraInicio.ToString("HH:mm"),
            HoraFin:       i.HoraInicio.AddMinutes(i.DuracionMin).ToString("HH:mm"),
            Direccion:     i.Direccion,
            Status:        i.Status.ToString(),
            ClientePhone:  InstallationMapper.DisplayPhone(i),
            PlanNombre:    i.Plan?.Name,
            Notas:         i.Notas,
            MapsLink:      InstallationMapper.BuildMapsLink(i.GpsLatitude, i.GpsLongitude),
            TecnicoId:     i.TecnicoId
        ));

        // Visitas de tickets (soporte técnico, recolección de equipo, cambio de
        // plan, etc.) — el técnico necesita verlas en la misma agenda que sus
        // instalaciones, no revisarlas ticket por ticket aparte.
        var visits = await _visitRepo.GetAll()
            .Include(v => v.Ticket).ThenInclude(t => t!.Client).ThenInclude(c => c!.Plan)
            .Where(v => v.ScheduledAt.Date == targetDate.Date
                     && (v.TechnicianId == req.TecnicoId
                         || v.Technicians.Any(t => t.TechnicianId == req.TecnicoId))
                     && v.Status != VisitStatus.Cancelada)
            .OrderBy(v => v.ScheduledAt)
            .ToListAsync(ct);

        var visitItems = visits.Where(v => v.Ticket is not null).Select(v =>
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
                TecnicoId:     v.TechnicianId
            );
        });

        var items = installationItems.Concat(visitItems)
            .OrderBy(i => i.HoraInicio)
            .ToList();

        return new TechnicianAgendaDto(
            TecnicoId:     req.TecnicoId,
            TecnicoNombre: tecnico.FullName,
            Fecha:         req.Fecha,
            Items:         items
        );
    }
}
