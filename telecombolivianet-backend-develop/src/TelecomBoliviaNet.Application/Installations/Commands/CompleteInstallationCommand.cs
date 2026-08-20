using MediatR;
using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Application.DTOs.Installations;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Coverage;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Installations.Commands;

public record CompleteInstallationCommand(
    Guid                    InstalacionId,
    CompleteInstallationDto Dto,
    Guid                    ActorId,
    string                  ActorName,
    string                  ClientIp) : IRequest<Result>;

public class CompleteInstallationHandler : IRequestHandler<CompleteInstallationCommand, Result>
{
    private readonly IGenericRepository<Installation>    _instRepo;
    private readonly IGenericRepository<SupportTicket>   _ticketRepo;
    private readonly IGenericRepository<DistributionBox> _boxRepo;
    private readonly AuditService                        _audit;

    public CompleteInstallationHandler(
        IGenericRepository<Installation>    instRepo,
        IGenericRepository<SupportTicket>   ticketRepo,
        IGenericRepository<DistributionBox> boxRepo,
        AuditService                        audit)
    {
        _instRepo   = instRepo;
        _ticketRepo = ticketRepo;
        _boxRepo    = boxRepo;
        _audit      = audit;
    }

    public async Task<Result> Handle(CompleteInstallationCommand cmd, CancellationToken ct)
    {
        var inst = await _instRepo.GetAll()
            .Include(i => i.Ticket)
            .FirstOrDefaultAsync(i => i.Id == cmd.InstalacionId, ct);

        if (inst is null)
            return Result.Failure("Instalación no encontrada.");
        if (inst.Status == InstallationStatus.Completada)
            return Result.Failure("La instalación ya está completada.");
        if (inst.Status == InstallationStatus.Cancelada)
            return Result.Failure("No se puede completar una instalación cancelada.");

        // F3: si había puerto reservado al agendar y el técnico no eligió una
        // caja explícita (ese caso lo maneja CompleteInstallationWithBox),
        // la reserva se consume contra la caja reservada.
        if (cmd.Dto.DistributionBoxId is null && inst.DistributionBoxId is Guid reservedBoxId)
        {
            var box = await _boxRepo.GetByIdAsync(reservedBoxId);
            if (box is not null)
            {
                box.Ocupar();
                await _boxRepo.UpdateAsync(box);
            }
        }

        // Evidencia de cierre (F5): equipo, materiales, checklist y fotos.
        inst.EquipoOnuSerial = cmd.Dto.EquipoOnuSerial?.Trim();
        inst.MetrosDrop      = cmd.Dto.MetrosDrop;
        inst.ChecklistJson   = cmd.Dto.ChecklistJson;
        inst.FotosUrlsJson   = cmd.Dto.FotosUrls is { Count: > 0 }
            ? System.Text.Json.JsonSerializer.Serialize(cmd.Dto.FotosUrls)
            : null;

        inst.Status        = InstallationStatus.Completada;
        inst.ActualizadoAt = DateTime.UtcNow;
        await _instRepo.UpdateAsync(inst);

        if (inst.Ticket is not null &&
            inst.Ticket.Status is TicketStatus.Abierto or TicketStatus.EnProceso)
        {
            inst.Ticket.Status            = TicketStatus.Resuelto;
            inst.Ticket.ResolutionMessage = cmd.Dto.NotasTecnico ?? "Instalación completada exitosamente.";
            inst.Ticket.ResolvedAt        = DateTime.UtcNow;
            inst.Ticket.SlaCompliant      = inst.Ticket.DueDate.HasValue &&
                                            DateTime.UtcNow <= inst.Ticket.DueDate.Value;
            await _ticketRepo.UpdateAsync(inst.Ticket);
        }

        await _audit.LogAsync("Instalaciones", "INSTALACION_COMPLETADA",
            $"Instalación {cmd.InstalacionId} completada.",
            cmd.ActorId, cmd.ActorName, cmd.ClientIp);

        return Result.Success();
    }
}
