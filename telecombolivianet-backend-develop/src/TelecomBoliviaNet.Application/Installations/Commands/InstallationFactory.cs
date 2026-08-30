using TelecomBoliviaNet.Application.DTOs.Installations;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Entities.Tickets;

namespace TelecomBoliviaNet.Application.Installations.Commands;

public static class InstallationFactory
{
    public static Installation CreateInstallation(
        CreateInstallationCommand    cmd,
        CreateInstallationValidated  data)
        => new()
        {
            // Prospecto sin registrar -> ClientId null (Guid.Empty violaba el FK)
            ClientId       = cmd.Dto.ClienteId,
            // Identidad del prospecto solo cuando no hay cliente registrado
            ProspectName   = cmd.Dto.ClienteId.HasValue ? null : cmd.Dto.ProspectName?.Trim(),
            ProspectPhone  = cmd.Dto.ClienteId.HasValue ? null : cmd.Dto.ProspectPhone?.Trim(),
            ProspectIdentityCard = cmd.Dto.ClienteId.HasValue ? null : cmd.Dto.ProspectIdentityCard?.Trim(),
            ProspectBackupPhone  = cmd.Dto.ClienteId.HasValue ? null : cmd.Dto.ProspectBackupPhone?.Trim(),
            PlanId         = cmd.Dto.PlanId,
            Fecha          = data.Fecha,
            HoraInicio     = data.HoraInicio,
            DuracionMin    = data.Plan.DuracionInstalacionMin,
            Direccion      = cmd.Dto.Direccion.Trim(),
            Notas          = cmd.Dto.Notas?.Trim(),
            GpsLatitude    = cmd.Dto.GpsLatitude,
            GpsLongitude   = cmd.Dto.GpsLongitude,
            LocationSource = cmd.Dto.LocationSource?.Trim(),
            Status         = InstallationStatus.Pendiente,
            CreadoPorId    = cmd.ActorId,
            CreadoAt       = DateTime.UtcNow,
        };

    public static SupportTicket CreateTicket(
        CreateInstallationCommand   cmd,
        Installation              inst,
        CreateInstallationValidated data,
        string                    ticketNumber,
        Guid?                     assignedTechnicianId = null,
        string?                   boxCodigo  = null,
        string?                   zoneNombre = null)
    {
        var tbnCode      = data.Client?.TbnCode  ?? "NUEVO";
        var clienteNombre= data.Client?.FullName ?? inst.ProspectName ?? "Cliente nuevo";

        var descLines = new List<string>
        {
            $"Instalación agendada para el {cmd.Dto.Fecha} a las {cmd.Dto.HoraInicio}.",
            $"Plan: {data.Plan.Name}",
            $"Dirección: {cmd.Dto.Direccion}",
        };
        if (boxCodigo is not null)
            descLines.Add($"Caja NAP: {boxCodigo}" + (zoneNombre is not null ? $" · Zona: {zoneNombre}" : ""));
        else if (zoneNombre is not null)
            descLines.Add($"Zona: {zoneNombre}");
        if (!cmd.Dto.ClienteId.HasValue && inst.ProspectBackupPhone is not null)
            descLines.Add($"Teléfono de respaldo: {inst.ProspectBackupPhone}");
        if (cmd.Dto.Notas is not null)
            descLines.Add($"Notas: {cmd.Dto.Notas}");

        return new SupportTicket
        {
            TicketNumber         = ticketNumber,
            ClientId             = cmd.Dto.ClienteId,
            ProspectName         = cmd.Dto.ClienteId.HasValue ? null : inst.ProspectName,
            ProspectPhone        = cmd.Dto.ClienteId.HasValue ? null : inst.ProspectPhone,
            ProspectIdentityCard = cmd.Dto.ClienteId.HasValue ? null : inst.ProspectIdentityCard,
            ProspectBackupPhone  = cmd.Dto.ClienteId.HasValue ? null : inst.ProspectBackupPhone,
            Subject              = $"[Instalación Nueva] {tbnCode} – {clienteNombre} – {cmd.Dto.Fecha} {cmd.Dto.HoraInicio}",
            Type                 = TicketType.InstalacionNueva,
            Priority             = TicketPriority.Media,
            Status               = TicketStatus.Abierto,
            Origin               = TicketOrigin.Bot,
            Description          = string.Join("\n", descLines),
            AssignedToUserId     = assignedTechnicianId,
            CreatedByUserId      = cmd.ActorId,
            CreatedAt            = DateTime.UtcNow,
            DueDate              = InstallationTicketSync.ComputeDueDate(
                                       data.Fecha, data.HoraInicio, inst.DuracionMin),
        };
    }
}
