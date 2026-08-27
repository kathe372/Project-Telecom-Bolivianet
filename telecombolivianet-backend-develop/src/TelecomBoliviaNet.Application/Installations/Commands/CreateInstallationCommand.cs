using MediatR;
using TelecomBoliviaNet.Application.Coverage.Services;
using TelecomBoliviaNet.Application.DTOs.Installations;
using TelecomBoliviaNet.Application.Services;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Application.Services.Tickets;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Coverage;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;
using TelecomBoliviaNet.Domain.Services;

namespace TelecomBoliviaNet.Application.Installations.Commands;

public record CreateInstallationCommand(
    CreateInstallationDto Dto,
    Guid   ActorId,
    string ActorName,
    string ClientIp) : IRequest<Result<InstallationCreatedDto>>;

public class CreateInstallationHandler
    : IRequestHandler<CreateInstallationCommand, Result<InstallationCreatedDto>>
{
    private readonly IInstallationRepository              _instRepo;
    private readonly IGenericRepository<SupportTicket>    _ticketRepo;
    private readonly IGenericRepository<TicketVisit>      _visitRepo;
    private readonly IDistributionBoxRepository  _boxRepo;
    private readonly AuditService                         _audit;
    private readonly CreateInstallationValidator          _validator;
    private readonly IBoxReservationService               _boxReservation;
    private readonly TicketNumberService                  _ticketNumSvc;
    private readonly TicketBalancingService               _balanceoSvc;

    // F5: eran doce dependencias, y CUATRO de ellas —cliente, plan, usuario y
    // el calculador de huecos— no las usaba este handler en ninguna línea:
    // estaban solo para construir el validador a mano con `new`. Ahora el
    // validador se inyecta como cualquier otro colaborador y esas cuatro
    // desaparecen de aquí.
    public CreateInstallationHandler(
        IInstallationRepository           instRepo,
        IGenericRepository<SupportTicket> ticketRepo,
        IGenericRepository<TicketVisit>   visitRepo,
        IDistributionBoxRepository        boxRepo,
        AuditService                      audit,
        CreateInstallationValidator       validator,
        IBoxReservationService            boxReservation,
        TicketNumberService               ticketNumSvc,
        TicketBalancingService            balanceoSvc)
    {
        _instRepo       = instRepo;
        _ticketRepo     = ticketRepo;
        _visitRepo      = visitRepo;
        _boxRepo        = boxRepo;
        _audit          = audit;
        _validator      = validator;
        _boxReservation = boxReservation;
        _ticketNumSvc   = ticketNumSvc;
        _balanceoSvc    = balanceoSvc;
    }

    public async Task<Result<InstallationCreatedDto>> Handle(
        CreateInstallationCommand cmd, CancellationToken ct)
    {
        var validation = await _validator.ValidateAsync(
            cmd.Dto.ClienteId, cmd.Dto.PlanId, cmd.Dto.Fecha, cmd.Dto.HoraInicio,
            cmd.Dto.ProspectName, cmd.Dto.ProspectIdentityCard, cmd.Dto.ProspectBackupPhone,
            cmd.Dto.ProspectPhone, ct);

        if (!validation.IsSuccess)
            return Result<InstallationCreatedDto>.Failure(validation.ErrorMessage);

        var data = validation.Value!;
        var inst = InstallationFactory.CreateInstallation(cmd, data);

        // Nivel comercial (F3): el puerto NAP se reserva al agendar y se
        // libera al cancelar/no-show — no recién al completar.
        string? boxCodigo = null, zoneNombre = null;
        if (cmd.Dto.GpsLatitude is decimal lat && cmd.Dto.GpsLongitude is decimal lng)
        {
            var reserva = await _boxReservation.TryReserveAsync((double)lat, (double)lng, inst.Id, ct);
            if (reserva is not null)
            {
                inst.DistributionBoxId = reserva.BoxId;
                inst.CoverageZoneId    = reserva.ZoneId;

                var box = await _boxRepo.GetByIdWithZoneAsync(reserva.BoxId, ct);
                boxCodigo  = box?.Codigo;
                zoneNombre = box?.Zone?.Nombre;
            }
            else
            {
                inst.Notas = string.IsNullOrWhiteSpace(inst.Notas)
                    ? "⚠ Sin puerto NAP disponible al agendar — revisar cobertura."
                    : $"{inst.Notas}\n⚠ Sin puerto NAP disponible al agendar — revisar cobertura.";
            }
        }

        // El técnico se asigna con el mismo criterio de balanceo por carga que
        // ya usan los tickets manuales (menor cantidad de casos activos) — así
        // toda instalación agendada por el bot llega con un responsable, sin
        // esperar a que un admin la asigne a mano.
        var assignedTechnicianId = await _balanceoSvc.GetTechnicianWithLowestLoadAsync();
        inst.TecnicoId = assignedTechnicianId;

        await _instRepo.AddAsync(inst);

        // Todo agendamiento genera ticket; para prospectos usa ProspectName/Phone
        // (SupportTicket.ClientId es nullable), igual que el módulo de tickets.
        var ticketNumber = await _ticketNumSvc.NextAsync();
        var ticket       = InstallationFactory.CreateTicket(
            cmd, inst, data, ticketNumber, assignedTechnicianId, boxCodigo, zoneNombre);
        await _ticketRepo.AddAsync(ticket);
        inst.TicketId      = ticket.Id;
        inst.ActualizadoAt = DateTime.UtcNow;

        // La fecha/hora de la instalación se refleja como una visita programada
        // del ticket — así aparece en la tab "Visitas" (con técnico, ubicación
        // vía el ticket, y el resto del flujo de visitas) en vez de vivir solo
        // como texto en la Descripción y como DueDate.
        var scheduledAt = DateTime.SpecifyKind(
            data.Fecha.Date.Add(data.HoraInicio.ToTimeSpan()), DateTimeKind.Utc);
        var visitObsParts = new List<string>();
        if (boxCodigo is not null)
            visitObsParts.Add($"Caja NAP: {boxCodigo}" + (zoneNombre is not null ? $" · Zona: {zoneNombre}" : ""));
        if (!cmd.Dto.ClienteId.HasValue && inst.ProspectBackupPhone is not null)
            visitObsParts.Add($"Teléfono de respaldo: {inst.ProspectBackupPhone}");
        await _visitRepo.AddAsync(new TicketVisit
        {
            TicketId        = ticket.Id,
            ScheduledAt     = scheduledAt,
            TechnicianId    = assignedTechnicianId,
            DuracionMin     = inst.DuracionMin,
            Observations    = visitObsParts.Count > 0 ? string.Join(" · ", visitObsParts) : null,
            Status          = VisitStatus.Programada,
            CreatedByUserId = cmd.ActorId,
            CreatedAt       = DateTime.UtcNow,
        });

        await _instRepo.SaveChangesAsync();

        var calendarLink = GoogleCalendarLinkBuilder.Build(inst, data.Plan.Name);

        await _audit.LogAsync("Instalaciones", "INSTALACION_CREADA",
            $"Instalación: {data.Client?.TbnCode ?? "NUEVO"} – {cmd.Dto.Fecha} {cmd.Dto.HoraInicio} – {data.Plan.Name}",
            cmd.ActorId, cmd.ActorName, cmd.ClientIp);

        return Result<InstallationCreatedDto>.Success(new InstallationCreatedDto(
            InstalacionId: inst.Id.ToString(),
            TicketId:      inst.TicketId?.ToString() ?? Guid.Empty.ToString(),
            Fecha:         cmd.Dto.Fecha,
            HoraInicio:    cmd.Dto.HoraInicio,
            Status:        inst.Status.ToString(),
            CalendarLink:  calendarLink));
    }
}
