using MediatR;
using TelecomBoliviaNet.Application.DTOs.Installations;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Installations.Commands;

public record AssignTechniciansCommand(
    Guid               InstalacionId,
    AssignTechniciansDto Dto,
    Guid               ActorId,
    string             ActorName,
    string             ClientIp
) : IRequest<Result>;

public class AssignTechniciansHandler : IRequestHandler<AssignTechniciansCommand, Result>
{
    private readonly IInstallationRepository _instRepo;
    private readonly TechnicianAssignmentService         _asignacion;
    private readonly AuditService                     _audit;

    public AssignTechniciansHandler(
        IInstallationRepository instRepo,
        TechnicianAssignmentService         asignacion,
        AuditService                     audit)
    {
        _instRepo   = instRepo;
        _asignacion = asignacion;
        _audit      = audit;
    }

    public async Task<Result> Handle(AssignTechniciansCommand cmd, CancellationToken ct)
    {
        var inst = await _instRepo.GetForCommandAsync(cmd.InstalacionId, ct);

        if (inst is null)
            return Result.Failure("Instalación no encontrada.");

        if (!cmd.Dto.TecnicoIds.Contains(cmd.Dto.TecnicoLeadId))
            return Result.Failure("El técnico lead debe estar incluido en la lista de técnicos.");

        var validacion = await _asignacion.ValidateAndRegisterAsync(inst, cmd.Dto, cmd.ActorId, ct);
        if (!validacion.IsSuccess) return validacion;

        inst.TecnicoId     = cmd.Dto.TecnicoLeadId;
        inst.Status        = InstallationStatus.EnProceso;
        inst.ActualizadoAt = DateTime.UtcNow;
        _instRepo.Update(inst);
        // D-13 — Había DOS SaveChangesAsync idénticos seguidos. El segundo no
        // guardaba nada (no queda nada pendiente tras el primero) pero daba a
        // entender que eran dos escrituras que podían quedar a medias.
        await _instRepo.SaveChangesAsync();

        await _audit.LogAsync(
            "Instalaciones", "INSTALACION_TECNICOS_ASIGNADOS",
            $"Técnicos {string.Join(",", cmd.Dto.TecnicoIds)} asignados a {cmd.InstalacionId}. Lead={cmd.Dto.TecnicoLeadId}",
            cmd.ActorId, cmd.ActorName, cmd.ClientIp);

        await _asignacion.NotificarAsync(inst, cmd.Dto);

        return Result.Success();
    }
}
