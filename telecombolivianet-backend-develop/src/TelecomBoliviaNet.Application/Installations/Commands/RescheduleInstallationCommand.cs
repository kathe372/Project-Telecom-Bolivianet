using MediatR;
using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Application.DTOs.Installations;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;
using TelecomBoliviaNet.Domain.Services;

namespace TelecomBoliviaNet.Application.Installations.Commands;

public record RescheduleInstallationCommand(
    Guid                       InstalacionId,
    RescheduleInstallationDto  Dto,
    Guid                       ActorId,
    string                     ActorName,
    string                     ClientIp) : IRequest<Result>;

public class RescheduleInstallationHandler : IRequestHandler<RescheduleInstallationCommand, Result>
{
    private readonly IGenericRepository<Installation>  _instRepo;
    private readonly IGenericRepository<SupportTicket> _ticketRepo;
    private readonly IGenericRepository<TicketVisit>   _visitRepo;
    private readonly IGenericRepository<UserSystem>    _userRepo;
    private readonly ISlotCalculatorService            _slotCalc;
    private readonly AuditService                      _audit;

    public RescheduleInstallationHandler(
        IGenericRepository<Installation>  instRepo,
        IGenericRepository<SupportTicket> ticketRepo,
        IGenericRepository<TicketVisit>   visitRepo,
        IGenericRepository<UserSystem>    userRepo,
        ISlotCalculatorService            slotCalc,
        AuditService                      audit)
    {
        _instRepo   = instRepo;
        _ticketRepo = ticketRepo;
        _visitRepo  = visitRepo;
        _userRepo   = userRepo;
        _slotCalc   = slotCalc;
        _audit      = audit;
    }

    public async Task<Result> Handle(RescheduleInstallationCommand cmd, CancellationToken ct)
    {
        var inst = await _instRepo.GetAll()
            .Include(i => i.Client)
            .Include(i => i.Plan)
            .Include(i => i.Ticket)
            .FirstOrDefaultAsync(i => i.Id == cmd.InstalacionId, ct);

        if (inst is null) return Result.Failure("Instalación no encontrada.");

        if (inst.Status is InstallationStatus.Completada or InstallationStatus.Cancelada)
            return Result.Failure("No se puede reprogramar una instalación completada o cancelada.");

        if (!DateTime.TryParse(cmd.Dto.Fecha, out var nuevaFechaParsed))
            return Result.Failure("Formato de fecha inválido.");

        var nuevaFecha = DateTime.SpecifyKind(nuevaFechaParsed.Date, DateTimeKind.Utc);

        if (!TimeOnly.TryParse(cmd.Dto.HoraInicio, out var nuevaHora))
            return Result.Failure("Formato de hora inválido.");

        // Resize del calendario: nueva duración antes de validar capacidad.
        if (cmd.Dto.DuracionMin is > 0)
            inst.DuracionMin = cmd.Dto.DuracionMin.Value;

        var disponible = await HasCapacityAsync(inst, nuevaFecha, nuevaHora, ct);
        if (!disponible)
            return Result.Failure("El nuevo horario no tiene disponibilidad.");

        // Vuelve a Pendiente (no Reprogramada): así sigue ocupando capacidad
        // y el T-1 vuelve a disparar para la nueva fecha (BUG B3).
        inst.Fecha          = nuevaFecha;
        inst.HoraInicio     = nuevaHora;
        inst.Status         = InstallationStatus.Pendiente;
        inst.ReminderSentAt = null;
        inst.ActualizadoAt  = DateTime.UtcNow;
        await _instRepo.UpdateAsync(inst);

        if (inst.Ticket is not null)
        {
            InstallationTicketSync.SyncSchedule(inst.Ticket, inst);
            await _ticketRepo.UpdateAsync(inst.Ticket);

            // La visita creada al agendar (ver CreateInstallationCommand) debe
            // moverse junto con la instalación, si no la tab "Visitas" del
            // ticket sigue mostrando la cita vieja.
            var visit = await _visitRepo.GetAll()
                .Where(v => v.TicketId == inst.Ticket.Id && v.Status == VisitStatus.Programada)
                .OrderBy(v => v.ScheduledAt)
                .FirstOrDefaultAsync(ct);
            if (visit is not null)
            {
                InstallationTicketSync.SyncVisit(visit, inst);
                await _visitRepo.UpdateAsync(visit);
            }
        }

        await _audit.LogAsync("Instalaciones", "INSTALACION_REPROGRAMADA",
            $"Instalación {cmd.InstalacionId} reprogramada a {cmd.Dto.Fecha} {cmd.Dto.HoraInicio}",
            cmd.ActorId, cmd.ActorName, cmd.ClientIp);

        return Result.Success();
    }

    /// <summary>Capacidad en la nueva franja, excluyendo esta misma instalación.</summary>
    private async Task<bool> HasCapacityAsync(
        Installation inst, DateTime fecha, TimeOnly hora, CancellationToken ct)
    {
        var horaFin = hora.AddMinutes(Math.Max(inst.DuracionMin, 1));
        var comprometidos = await _slotCalc.GetCommittedCapacityAsync(
            DateOnly.FromDateTime(fecha), hora, horaFin, inst.Id, ct);

        var pool = Math.Max(
            await _userRepo.GetAll()
                .CountAsync(u => u.Role == UserRole.Tecnico && u.Status == UserStatus.Activo, ct),
            1);

        var requeridos = Math.Max(inst.Plan?.TecnicosRequeridos ?? 1, 1);
        return pool - comprometidos >= requeridos;
    }
}
