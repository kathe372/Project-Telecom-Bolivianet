using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Entities.Tickets;

namespace TelecomBoliviaNet.Application.Installations.Commands;

/// <summary>
/// Mantiene el SupportTicket de una instalación alineado con su agenda:
/// al reprogramar, el asunto y el DueDate (base del SLA) deben reflejar
/// la nueva fecha/hora, no la original.
/// </summary>
internal static class InstallationTicketSync
{
    internal static DateTime ComputeDueDate(DateTime fecha, TimeOnly horaInicio, int duracionMin)
        => fecha.Date.Add(horaInicio.ToTimeSpan()).AddMinutes(duracionMin);

    internal static void SyncSchedule(SupportTicket ticket, Installation inst)
    {
        if (ticket.Type != TicketType.InstalacionNueva) return;
        if (ticket.Status is not (TicketStatus.Abierto or TicketStatus.EnProceso)) return;

        var tbnCode = inst.Client?.TbnCode  ?? "NUEVO";
        var nombre  = inst.Client?.FullName ?? inst.ProspectName ?? "Cliente nuevo";

        ticket.Subject = $"[Instalación Nueva] {tbnCode} – {nombre} – " +
                         $"{inst.Fecha:yyyy-MM-dd} {inst.HoraInicio:HH\\:mm}";
        ticket.DueDate = ComputeDueDate(inst.Fecha, inst.HoraInicio, inst.DuracionMin);
    }

    /// <summary>
    /// 2026-08-05: al reprogramar, SyncSchedule ya alineaba el ticket
    /// (Subject/DueDate) pero la TicketVisit creada al agendar (ver
    /// CreateInstallationCommand) quedaba con la fecha/hora VIEJA — la tab
    /// "Visitas" del ticket seguía mostrando la cita original después de
    /// reprogramar. Actualiza la visita "Programada" más próxima del ticket
    /// para que refleje la nueva agenda.
    /// </summary>
    internal static void SyncVisit(TicketVisit? visit, Installation inst)
    {
        if (visit is null || visit.Status != VisitStatus.Programada) return;

        visit.ScheduledAt = DateTime.SpecifyKind(
            inst.Fecha.Date.Add(inst.HoraInicio.ToTimeSpan()), DateTimeKind.Utc);
        visit.DuracionMin  = inst.DuracionMin;
    }
}
