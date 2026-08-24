using MediatR;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.Coverage.Services;
using TelecomBoliviaNet.Application.DTOs.Installations;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Application.Services.Notifications;
using TelecomBoliviaNet.Domain.Entities.Admin;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Installations.Commands;

public record CancelInstallationCommand(
    Guid                   InstalacionId,
    CancelInstallationDto Dto,
    Guid                   ActorId,
    string                 ActorName,
    string                 ClientIp) : IRequest<Result>;

public class CancelInstallationHandler : IRequestHandler<CancelInstallationCommand, Result>
{
    /// <summary>Ventana mínima de cancelación (estándar comercial: 24 h).</summary>
    private const int DefaultCancelMinHours = 24;

    private readonly IInstallationRepository  _instRepo;
    private readonly IGenericRepository<SupportTicket> _ticketRepo;
    private readonly IGenericRepository<SystemConfig>  _configRepo;
    private readonly AuditService                      _audit;
    private readonly IBoxReservationService            _boxReservation;
    private readonly IBotProxyService?                 _botProxy;
    private readonly ILogger<CancelInstallationHandler>? _logger;

    public CancelInstallationHandler(
        IInstallationRepository  instRepo,
        IGenericRepository<SupportTicket> ticketRepo,
        IGenericRepository<SystemConfig>  configRepo,
        AuditService                      audit,
        IBoxReservationService            boxReservation,
        IBotProxyService?                 botProxy = null,
        ILogger<CancelInstallationHandler>? logger = null)
    {
        _instRepo       = instRepo;
        _ticketRepo     = ticketRepo;
        _configRepo     = configRepo;
        _audit          = audit;
        _boxReservation = boxReservation;
        _botProxy       = botProxy;
        _logger         = logger;
    }

    public async Task<Result> Handle(CancelInstallationCommand cmd, CancellationToken ct)
    {
        var inst = await _instRepo.GetForCommandAsync(cmd.InstalacionId, ct);

        if (inst is null)
            return Result.Failure("Instalación no encontrada.");

        if (inst.Status is InstallationStatus.Completada or InstallationStatus.Cancelada)
            return Result.Failure($"La instalación ya está {inst.Status}. No se puede cancelar.");

        var esAdmin = string.Equals(cmd.Dto.CanceladoPor, "ADMIN", StringComparison.OrdinalIgnoreCase);
        if (!esAdmin)
        {
            var minHoras  = await GetCancelMinHoursAsync();
            // P1.3 (auditoría 2026-08): inst.Fecha/HoraInicio son hora LOCAL de
            // Bolivia (aunque el campo esté tageado como Utc — nunca se
            // convierte, solo se etiqueta). Compararlo contra DateTime.UtcNow
            // real desfasaba la ventana de anticipación en 4 horas. Se compara
            // "ahora" también convertido a hora local, mismas unidades a
            // ambos lados.
            var fechaHora  = inst.Fecha.Date.Add(inst.HoraInicio.ToTimeSpan());
            var ahoraLocal = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, NotifShared.BoliviaZone);
            if ((fechaHora - ahoraLocal).TotalHours < minHoras)
                return Result.Failure(
                    $"No se puede cancelar con menos de {minHoras} horas de anticipación.");
        }

        // Libera el puerto NAP reservado ANTES de marcar Cancelada (F3):
        // el puerto vuelve a estar disponible para otros agendamientos.
        await _boxReservation.ReleaseAsync(inst, ct);

        inst.Status            = InstallationStatus.Cancelada;
        inst.MotivoCancelacion = cmd.Dto.MotivoCancelacion.Trim();
        inst.CanceladoPor      = cmd.Dto.CanceladoPor;
        inst.CanceladoAt       = DateTime.UtcNow;
        inst.ActualizadoAt     = DateTime.UtcNow;
        _instRepo.Update(inst);
        await _instRepo.SaveChangesAsync();
        if (inst.Ticket is not null &&
            inst.Ticket.Status is TicketStatus.Abierto or TicketStatus.EnProceso)
        {
            inst.Ticket.Status            = TicketStatus.Cerrado;
            inst.Ticket.ResolutionMessage = $"Instalación cancelada. Motivo: {cmd.Dto.MotivoCancelacion}";
            inst.Ticket.ClosedAt          = DateTime.UtcNow;
            _ticketRepo.Update(inst.Ticket);
            await _ticketRepo.SaveChangesAsync();
        }

        // F6 nivel comercial: si cancela la empresa, se avisa al cliente/prospecto
        // por WhatsApp (best-effort — no bloquea la cancelación).
        if (esAdmin) await NotificarCancelacionAsync(inst);

        await _audit.LogAsync("Instalaciones", "INSTALACION_CANCELADA",
            $"Instalación cancelada: {cmd.InstalacionId} — {cmd.Dto.MotivoCancelacion} — por {cmd.Dto.CanceladoPor}",
            cmd.ActorId, cmd.ActorName, cmd.ClientIp);

        return Result.Success();
    }

    private async Task<int> GetCancelMinHoursAsync()
    {
        var cfg = await _configRepo.FirstOrDefaultAsync(
            c => c.Key == SystemConfigKeys.InstallationCancelMinHours);
        return int.TryParse(cfg?.Value, out var h) && h >= 0 ? h : DefaultCancelMinHours;
    }

    private async Task NotificarCancelacionAsync(Installation inst)
    {
        if (_botProxy is null) return;

        var phone = inst.Client?.PhoneMain ?? inst.ProspectPhone;
        if (string.IsNullOrWhiteSpace(phone)) return;

        var nombre = inst.Client?.FullName ?? inst.ProspectName ?? "cliente";
        var texto  =
            $"Hola {nombre} 👋. Lamentamos informarte que tu instalación programada " +
            $"para el {inst.Fecha:dd/MM/yyyy} a las {inst.HoraInicio:HH\\:mm} fue cancelada. " +
            $"Motivo: {inst.MotivoCancelacion}. Escríbenos por este chat para reagendarla.";

        try
        {
            await _botProxy.SendAdminMessageAsync(phone, texto);
        }
        catch (Exception ex)
        {
            _logger?.LogWarning(ex,
                "No se pudo notificar la cancelación de {InstId} a {Phone}.", inst.Id, phone);
        }
    }
}
