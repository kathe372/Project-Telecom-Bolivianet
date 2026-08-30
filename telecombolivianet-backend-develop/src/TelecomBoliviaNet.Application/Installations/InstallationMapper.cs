using TelecomBoliviaNet.Application.DTOs.Installations;
using TelecomBoliviaNet.Application.Services;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Application.Constants;

namespace TelecomBoliviaNet.Application.Installations;

internal static class InstallationMapper
{
    internal static string? BuildMapsLink(decimal? lat, decimal? lng)
        => lat.HasValue && lng.HasValue
            ? $"https://www.google.com/maps?q={lat},{lng}"
            : null;

    internal static string DisplayName(Installation i)
        => i.Client?.FullName ?? i.ProspectName ?? AppConstants.Display.SinDato;

    internal static string DisplayPhone(Installation i)
        => i.Client?.PhoneMain ?? i.ProspectPhone ?? AppConstants.Display.SinDato;

    internal static InstallationDetailDto ToDetail(Installation i) => new(
        Id:                i.Id,
        ClienteTbn:        i.Client?.TbnCode ?? (i.ProspectName is not null ? "PROSPECTO" : AppConstants.Display.SinDato),
        ClienteNombre:     DisplayName(i),
        ClientePhone:      DisplayPhone(i),
        PlanNombre:        i.Plan?.Name        ?? AppConstants.Display.SinDato,
        Fecha:             i.Fecha.ToString("yyyy-MM-dd"),
        HoraInicio:        i.HoraInicio.ToString("HH:mm"),
        HoraFin:           i.HoraInicio.AddMinutes(i.DuracionMin).ToString("HH:mm"),
        DuracionMin:       i.DuracionMin,
        Direccion:         i.Direccion,
        Notas:             i.Notas,
        Status:            i.Status.ToString(),
        TecnicoNombre:     i.Tecnico?.FullName,
        TecnicoId:         i.TecnicoId,
        TicketId:          i.TicketId,
        MotivoCancelacion: i.MotivoCancelacion,
        CanceladoPor:      i.CanceladoPor,
        CreadoAt:          i.CreadoAt,
        GpsLatitude:       i.GpsLatitude,
        GpsLongitude:      i.GpsLongitude,
        LocationSource:    i.LocationSource,
        MapsLink:          BuildMapsLink(i.GpsLatitude, i.GpsLongitude),
        CalendarLink:      GoogleCalendarLinkBuilder.Build(i, i.Plan?.Name ?? "Instalación"),
        Tecnicos:          i.Technicians
                               .Select(t => new AssignedTechnicianDto(
                                   t.TechnicianId,
                                   t.Technician?.FullName ?? AppConstants.Display.SinDato,
                                   t.Technician?.Phone,
                                   t.IsLead,
                                   t.AssignedAt))
                               .ToList(),
        DistributionBoxId: i.DistributionBoxId,
        BoxCodigo:         i.DistributionBox?.Codigo,
        PlanId:            i.PlanId
    );

    internal static InstallationListItemDto ToListItem(Installation i) => new(
        Id:            i.Id,
        ClienteTbn:    i.Client?.TbnCode ?? (i.ProspectName is not null ? "PROSPECTO" : AppConstants.Display.SinDato),
        ClienteNombre: DisplayName(i),
        PlanNombre:    i.Plan?.Name       ?? AppConstants.Display.SinDato,
        Fecha:         i.Fecha.ToString("yyyy-MM-dd"),
        HoraInicio:    i.HoraInicio.ToString("HH:mm"),
        Status:        i.Status.ToString(),
        TecnicoNombre: i.Tecnico?.FullName,
        TicketId:      i.TicketId,
        CreadoAt:      i.CreadoAt,
        BoxCodigo:     i.DistributionBox?.Codigo,
        ClientePhone:  i.Client?.PhoneMain ?? i.ProspectPhone,
        DuracionMin:   i.DuracionMin,
        TecnicoId:     i.TecnicoId
    );
}
