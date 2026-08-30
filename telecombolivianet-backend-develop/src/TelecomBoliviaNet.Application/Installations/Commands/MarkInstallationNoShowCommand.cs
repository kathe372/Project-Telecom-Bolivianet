using MediatR;
using TelecomBoliviaNet.Application.Coverage.Services;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Installations.Commands;

/// <summary>
/// Registra que la visita se realizó pero la instalación NO pudo hacerse
/// (cliente ausente, domicilio inaccesible, etc.). Libera el slot del técnico
/// —el estado NoRealizada no cuenta como comprometido— y deja el motivo
/// para métricas de no-show.
/// </summary>
public record MarkInstallationNoShowCommand(
    Guid   InstalacionId,
    string Motivo,
    Guid   ActorId,
    string ActorName,
    string ClientIp) : IRequest<Result>;

public class MarkInstallationNoShowHandler
    : IRequestHandler<MarkInstallationNoShowCommand, Result>
{
    private readonly IGenericRepository<Installation> _instRepo;
    private readonly AuditService                     _audit;
    private readonly IBoxReservationService           _boxReservation;

    public MarkInstallationNoShowHandler(
        IGenericRepository<Installation> instRepo,
        AuditService                     audit,
        IBoxReservationService           boxReservation)
    {
        _instRepo       = instRepo;
        _audit          = audit;
        _boxReservation = boxReservation;
    }

    public async Task<Result> Handle(MarkInstallationNoShowCommand cmd, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(cmd.Motivo))
            return Result.Failure("El motivo es obligatorio (ej: cliente ausente).");

        var inst = await _instRepo.GetByIdAsync(cmd.InstalacionId);
        if (inst is null)
            return Result.Failure("Instalación no encontrada.");

        if (inst.Status is not (InstallationStatus.Pendiente or InstallationStatus.EnProceso))
            return Result.Failure(
                $"Solo instalaciones pendientes o en proceso pueden marcarse como no realizadas (actual: {inst.Status}).");

        // Libera el puerto NAP reservado: la visita no se concretó (F3).
        await _boxReservation.ReleaseAsync(inst, ct);

        inst.MarcarNoRealizada(cmd.Motivo, DateTime.UtcNow);
        inst.ActualizadoAt     = DateTime.UtcNow;
        _instRepo.Update(inst);
        await _instRepo.SaveChangesAsync();
        await _audit.LogAsync("Instalaciones", "INSTALACION_NO_REALIZADA",
            $"Instalación no realizada: {cmd.InstalacionId} — {cmd.Motivo}",
            cmd.ActorId, cmd.ActorName, cmd.ClientIp);

        return Result.Success();
    }
}
