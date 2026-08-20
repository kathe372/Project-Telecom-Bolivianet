using TelecomBoliviaNet.Application.DTOs.Installations;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Entities.Notifications;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Installations.Commands;

public class TechnicianAssignmentService
{
    private readonly IGenericRepository<InstallationTechnician> _techRepo;
    private readonly IGenericRepository<UserSystem>             _userRepo;
    private readonly INotifPublisher?                           _notifPublisher;

    public TechnicianAssignmentService(
        IGenericRepository<InstallationTechnician> techRepo,
        IGenericRepository<UserSystem>             userRepo,
        INotifPublisher?                           notifPublisher = null)
    {
        _techRepo       = techRepo;
        _userRepo       = userRepo;
        _notifPublisher = notifPublisher;
    }

    public async Task<Result> ValidateAndRegisterAsync(
        Installation inst, AssignTechniciansDto dto, Guid actorId, CancellationToken ct)
    {
        foreach (var tecId in dto.TecnicoIds)
        {
            var tec = await _userRepo.GetByIdAsync(tecId);
            if (tec is null)
                return Result.Failure($"El técnico {tecId} no existe.");
            if (tec.Role != UserRole.Tecnico && tec.Role != UserRole.Admin)
                return Result.Failure($"El usuario {tec.FullName} no tiene rol Técnico o Admin.");
            if (inst.Technicians.Any(t => t.TechnicianId == tecId))
                return Result.Failure($"El técnico {tec.FullName} ya está asignado a esta instalación.");

            await _techRepo.AddAsync(new InstallationTechnician
            {
                InstallationId = inst.Id,
                TechnicianId   = tecId,
                IsLead         = tecId == dto.TecnicoLeadId,
                AssignedBy     = actorId,
            });
        }

        return Result.Success();
    }

    public async Task NotificarAsync(Installation inst, AssignTechniciansDto dto)
    {
        if (_notifPublisher is null) return;

        // BUG-14: instalación de PROSPECTO (sin ClientId) — NotifOutbox exige un
        // cliente registrado (FK NOT NULL), así que no hay notificación que emitir.
        if (inst.ClientId is not Guid clienteId) return;

        var fecha = inst.Fecha.ToLocalTime().ToString("dd/MM/yyyy");
        var hora  = inst.HoraInicio.ToString("HH:mm");

        foreach (var tecId in dto.TecnicoIds)
        {
            var tec = await _userRepo.GetByIdAsync(tecId);
            if (tec?.Phone is null) continue;

            await _notifPublisher.PublishAsync(
                NotifType.INSTALACION_ASIGNADA,
                clienteId,
                tec.Phone,
                new Dictionary<string, string>
                {
                    ["tecnico"]   = tec.FullName,
                    ["fecha"]     = fecha,
                    ["hora"]      = hora,
                    ["direccion"] = inst.Direccion,
                    ["es_lead"]   = tecId == dto.TecnicoLeadId ? "sí" : "no",
                },
                referenciaId: inst.Id);
        }
    }
}
