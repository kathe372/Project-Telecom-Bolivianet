using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Application.Services.Notifications;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;
using TelecomBoliviaNet.Domain.Services;

namespace TelecomBoliviaNet.Application.Installations.Commands;

public record CreateInstallationValidated(
    Client?  Client,
    Plan     Plan,
    DateTime Fecha,
    TimeOnly HoraInicio);

public class CreateInstallationValidator
{
    private readonly IInstallationRepository _instRepo;
    private readonly IClientRepository       _clientRepo;
    private readonly IGenericRepository<Plan>         _planRepo;
    private readonly IGenericRepository<UserSystem>   _userRepo;
    private readonly ISlotCalculatorService           _slotCalc;

    public CreateInstallationValidator(
        IInstallationRepository instRepo,
        IClientRepository       clientRepo,
        IGenericRepository<Plan>         planRepo,
        IGenericRepository<UserSystem>   userRepo,
        ISlotCalculatorService           slotCalc)
    {
        _instRepo   = instRepo;
        _clientRepo = clientRepo;
        _planRepo   = planRepo;
        _userRepo   = userRepo;
        _slotCalc   = slotCalc;
    }

    public async Task<Result<CreateInstallationValidated>> ValidateAsync(
        Guid?   clienteId,
        Guid    planId,
        string  fechaStr,
        string  horaStr,
        string? prospectName,
        string? prospectIdentityCard,
        string? prospectBackupPhone,
        string? prospectPhone,
        CancellationToken ct)
    {
        // PASO 10 (2026-08): antes solo el prompt del chatbot "pedía" nombre y CI
        // al prospecto — el backend nunca lo exigía, así que un cliente sin
        // registrar podía agendar sin ningún dato de identidad verificable.
        // Bloqueante, mismo criterio para los tres campos (nombre, CI y
        // teléfono de respaldo distinto del WhatsApp desde el que escribe).
        if (!clienteId.HasValue)
        {
            if (string.IsNullOrWhiteSpace(prospectName))
                return Result<CreateInstallationValidated>.Failure(
                    "Se requiere el nombre completo del prospecto para agendar la instalación.");
            if (string.IsNullOrWhiteSpace(prospectIdentityCard))
                return Result<CreateInstallationValidated>.Failure(
                    "Se requiere la cédula de identidad del prospecto para agendar la instalación.");
            if (string.IsNullOrWhiteSpace(prospectBackupPhone))
                return Result<CreateInstallationValidated>.Failure(
                    "Se requiere un teléfono de contacto alterno para agendar la instalación.");

            // 2026-08-05: el cliente registrado ya tenía este guard (más abajo,
            // por ClientId) — al prospecto le faltaba el equivalente. Sin esto,
            // si el bot llamaba create_installation de nuevo en vez de
            // reschedule_installation (p. ej. el cliente pide "cámbiame la
            // hora" y el agente no usa la herramienta correcta), se creaba una
            // Installation Y un SupportTicket nuevos — la instalación vieja
            // quedaba huérfana con su ticket sin actualizar, y el prospecto
            // terminaba con 2 tickets de instalación para la misma solicitud.
            // ProspectPhone (el WhatsApp desde el que escribe) es el único
            // identificador estable de un prospecto entre turnos.
            if (!string.IsNullOrWhiteSpace(prospectPhone))
            {
                var prospectoTienePendiente =
                    await _instRepo.HasOpenForProspectAsync(prospectPhone, ct);

                if (prospectoTienePendiente)
                    return Result<CreateInstallationValidated>.Failure(
                        "Ya existe una instalación pendiente o en proceso para este número. " +
                        "Para cambiar la fecha u hora, reprograma la instalación existente en vez de agendar una nueva.");
            }
        }

        if (!DateTime.TryParse(fechaStr, out var fechaParsed))
            return Result<CreateInstallationValidated>.Failure("Formato de fecha inválido. Use YYYY-MM-DD.");

        var fecha = DateTime.SpecifyKind(fechaParsed.Date, DateTimeKind.Utc);
        // P1.3 (auditoría 2026-08): fecha es la fecha LOCAL que pidió el
        // cliente — compararla contra el día UTC (en vez del día local)
        // rechazaba horarios de HOY válidos entre las 20:00-23:59 hora
        // Bolivia (ya es el día siguiente en UTC).
        var hoyLocal = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, NotifShared.BoliviaZone).Date;
        if (fecha < hoyLocal)
            return Result<CreateInstallationValidated>.Failure("La fecha debe ser futura.");

        if (!TimeOnly.TryParse(horaStr, out var horaInicio))
            return Result<CreateInstallationValidated>.Failure("Formato de hora inválido. Use HH:mm.");

        var plan = await _planRepo.GetByIdAsync(planId);
        if (plan is null || !plan.IsActive)
            return Result<CreateInstallationValidated>.Failure("El plan seleccionado no existe o está inactivo.");

        Client? client = null;
        if (clienteId.HasValue)
        {
            client = await _clientRepo.GetWithPlanAsync(clienteId.Value, ct);

            if (client is null)
                return Result<CreateInstallationValidated>.Failure("El cliente indicado no existe.");

            var tienePendiente = await _instRepo.HasOpenForClientAsync(client.Id, ct);

            if (tienePendiente)
                return Result<CreateInstallationValidated>.Failure(
                    "El cliente ya tiene una instalación pendiente o en proceso.");
        }

        // Capacidad por solapamiento (misma regla que los slots mostrados al
        // cliente): comprometidos vs pool, exigiendo los técnicos del plan.
        var horaFin = horaInicio.AddMinutes(Math.Max(plan.DuracionInstalacionMin, 1));
        var comprometidos = await _slotCalc.GetCommittedCapacityAsync(
            DateOnly.FromDateTime(fecha), horaInicio, horaFin, ct: ct);

        var pool = Math.Max(
            await _userRepo.CountAsync(
                u => u.Role == UserRole.Tecnico && u.Status == UserStatus.Activo),
            1);

        if (pool - comprometidos < Math.Max(plan.TecnicosRequeridos, 1))
            return Result<CreateInstallationValidated>.Failure(
                "El horario seleccionado ya no tiene disponibilidad. Por favor elige otro.");

        return Result<CreateInstallationValidated>.Success(
            new CreateInstallationValidated(client, plan, fecha, horaInicio));
    }
}
