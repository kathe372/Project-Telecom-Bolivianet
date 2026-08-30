using MediatR;
using Microsoft.Extensions.Logging;
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
    private readonly IInstallationRepository    _instRepo;
    private readonly IGenericRepository<SupportTicket>   _ticketRepo;
    private readonly IGenericRepository<DistributionBox> _boxRepo;
    private readonly AuditService                        _audit;
    private readonly IUnitOfWork                         _uow;
    private readonly ILogger<CompleteInstallationHandler> _logger;

    public CompleteInstallationHandler(
        IInstallationRepository    instRepo,
        IGenericRepository<SupportTicket>   ticketRepo,
        IGenericRepository<DistributionBox> boxRepo,
        AuditService                        audit,
        IUnitOfWork                         uow,
        ILogger<CompleteInstallationHandler> logger)
    {
        _instRepo   = instRepo;
        _ticketRepo = ticketRepo;
        _boxRepo    = boxRepo;
        _audit      = audit;
        _uow        = uow;
        _logger     = logger;
    }

    public async Task<Result> Handle(CompleteInstallationCommand cmd, CancellationToken ct)
    {
        var inst = await _instRepo.GetForCommandAsync(cmd.InstalacionId, ct);

        if (inst is null)
            return Result.Failure("Instalación no encontrada.");
        if (inst.Status == InstallationStatus.Completada)
            return Result.Failure("La instalación ya está completada.");
        if (inst.Status == InstallationStatus.Cancelada)
            return Result.Failure("No se puede completar una instalación cancelada.");

        // F3.3 — Las tres escrituras (caja, instalación, ticket) son UNA operación.
        //
        // Antes cada una confirmaba por su cuenta: si fallaba la tercera, el puerto
        // quedaba consumido y la instalación completada, pero el ticket abierto
        // PARA SIEMPRE — nadie volvería a mirarlo porque la instalación ya figuraba
        // cerrada. Era el único hallazgo del plan capaz de dejar datos
        // inconsistentes en producción.
        await _uow.BeginTransactionAsync(ct);
        try
        {
            // Si había puerto reservado al agendar y el técnico no eligió una caja
            // explícita (ese caso lo maneja CompleteInstallationWithBox), la
            // reserva se consume contra la caja reservada.
            if (cmd.Dto.DistributionBoxId is null && inst.DistributionBoxId is Guid reservedBoxId)
            {
                var box = await _boxRepo.GetByIdAsync(reservedBoxId);
                if (box is not null)
                {
                    box.Ocupar();
                    _boxRepo.Update(box);
                }
            }

            // Evidencia de cierre: equipo, materiales, checklist y fotos.
            inst.EquipoOnuSerial = cmd.Dto.EquipoOnuSerial?.Trim();
            inst.MetrosDrop      = cmd.Dto.MetrosDrop;
            inst.ChecklistJson   = cmd.Dto.ChecklistJson;
            inst.FotosUrlsJson   = cmd.Dto.FotosUrls is { Count: > 0 }
                ? System.Text.Json.JsonSerializer.Serialize(cmd.Dto.FotosUrls)
                : null;

            inst.Status        = InstallationStatus.Completada;
            inst.ActualizadoAt = DateTime.UtcNow;
            _instRepo.Update(inst);

            // D-09 — El serial de la ONU se copia también a la ficha del cliente.
            //
            // Se guardaba SOLO en la instalación, y `CancelClientCommand` crea el
            // ticket de recolección leyendo `client.OnuSerialNumber`: al dar de baja
            // a alguien, el ticket salía sin el número del equipo que hay que ir a
            // recuperar. Eran dos sitios para el mismo dato y ya divergían.
            //
            // Va dentro de la MISMA transacción: instalación cerrada con la ficha
            // sin actualizar es exactamente la inconsistencia que se está cerrando.
            // El cliente ya viene cargado por GetForCommandAsync, así que no hace
            // falta otra dependencia.
            var serial = inst.EquipoOnuSerial;
            if (inst.Client is not null && !string.IsNullOrWhiteSpace(serial))
            {
                // Un cierre sin serial NO borra el que ya hubiera: el técnico pudo
                // no anotarlo, y eso no es lo mismo que "este cliente no tiene ONU".
                if (!string.Equals(inst.Client.OnuSerialNumber, serial, StringComparison.OrdinalIgnoreCase))
                {
                    // Si ya había otro, es un cambio de equipo: la instalación que
                    // se acaba de cerrar es el dato más reciente, pero el anterior
                    // no puede desaparecer sin dejar rastro.
                    if (!string.IsNullOrWhiteSpace(inst.Client.OnuSerialNumber))
                        _logger.LogInformation(
                            "Instalación {Id}: la ONU del cliente {ClientId} pasa de {Anterior} a {Nuevo}.",
                            cmd.InstalacionId, inst.Client.Id, inst.Client.OnuSerialNumber, serial);

                    inst.Client.OnuSerialNumber = serial;
                }
            }

            if (inst.Ticket is not null &&
                inst.Ticket.Status is TicketStatus.Abierto or TicketStatus.EnProceso)
            {
                inst.Ticket.Status            = TicketStatus.Resuelto;
                inst.Ticket.ResolutionMessage = cmd.Dto.NotasTecnico ?? "Instalación completada exitosamente.";
                inst.Ticket.ResolvedAt        = DateTime.UtcNow;
                inst.Ticket.SlaCompliant      = inst.Ticket.DueDate.HasValue &&
                                                DateTime.UtcNow <= inst.Ticket.DueDate.Value;
                _ticketRepo.Update(inst.Ticket);
            }

            // Un único commit para las tres.
            await _instRepo.SaveChangesAsync();
            await _uow.CommitAsync(ct);
        }
        catch (Exception ex)
        {
            await _uow.RollbackAsync(ct);
            _logger.LogError(ex,
                "Error al completar la instalación {Id} — no se aplicó ningún cambio.",
                cmd.InstalacionId);
            return Result.Failure("No se pudo completar la instalación. No se aplicó ningún cambio.");
        }

        // La auditoría va FUERA de la transacción a propósito: si el asiento
        // fallara, no debe deshacer una instalación que ya se cerró bien.
        await _audit.LogAsync("Instalaciones", "INSTALACION_COMPLETADA",
            $"Instalación {cmd.InstalacionId} completada.",
            cmd.ActorId, cmd.ActorName, cmd.ClientIp);

        return Result.Success();
    }
}
