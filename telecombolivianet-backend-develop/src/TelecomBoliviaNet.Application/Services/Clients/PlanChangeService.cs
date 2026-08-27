// F4: la referencia a EF Core queda por UN motivo, el mismo que en
// UpdateClientCommand — capturar DbUpdateConcurrencyException, el tipo que lanza
// EF cuando el token xmin detecta una modificación concurrente. Ya no queda
// ninguna consulta de EF en este archivo.
using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Application.DTOs.Clients;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Application.Services.Invoices;
using TelecomBoliviaNet.Application.Services.Tickets;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Notifications;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;
using TelecomBoliviaNet.Domain.Services;

namespace TelecomBoliviaNet.Application.Services.Clients;

/// <summary>
/// Resolver una solicitud de cambio de plan: aprobarla —aplicándola ya o
/// dejándola para fin de mes— o rechazarla.
///
/// <para>Pedirla está en <see cref="PlanChangeRequestService"/> y las lecturas en
/// <see cref="PlanChangeQueryService"/>. Eran 362 líneas y doce dependencias en
/// una sola clase (F5).</para>
/// </summary>
public class PlanChangeService : IPlanChangeService
{
    private readonly IPlanChangeRequestRepository _changeRepo;
    private readonly IClientRepository             _clientRepo;
    private readonly ITicketRepository      _ticketRepo;
    private readonly AuditService                           _audit;
    private readonly IUnitOfWork                            _uow;
    private readonly PlanChangeNotifier                     _planNotifier;
    private readonly InvoiceProrationService                _proration;

    public PlanChangeService(
        IPlanChangeRequestRepository changeRepo,
        IClientRepository            clientRepo,
        ITicketRepository     ticketRepo,
        AuditService                          audit,
        IUnitOfWork                           uow,
        PlanChangeNotifier                    planNotifier,
        InvoiceProrationService               proration)
    {
        _changeRepo      = changeRepo;
        _clientRepo      = clientRepo;
        _ticketRepo      = ticketRepo;
        _audit           = audit;
        _uow             = uow;
        _planNotifier    = planNotifier;
        _proration       = proration;
    }


    public async Task<Result<bool>> ApproveChangeAsync(
        Guid cambioId, bool midMonth,
        Guid actorId, string actorName, string ip)
    {
        var cambio = await _changeRepo.GetForCommandAsync(cambioId);

        if (cambio is null)
            return Result<bool>.Failure("Solicitud de cambio no encontrada.");
        if (cambio.Status != PlanChangeStatus.Pendiente)
            return Result<bool>.Failure("Esta solicitud ya fue procesada.");

        var client  = cambio.Client!;
        var newPlan = cambio.NewPlan!;
        var hoy     = DateTime.UtcNow;

        // Política: solo los upgrades pueden aplicarse de inmediato; los downgrades van a fin de mes.
        if (midMonth &&
            !PlanChangePolicy.AllowsImmediate(client.Plan?.MonthlyPrice ?? 0m, newPlan.MonthlyPrice))
            return Result<bool>.Failure(
                "Un cambio a un plan de igual o menor precio se aplica a fin de mes, no de inmediato.");

        var ticket = cambio.TicketId.HasValue
            ? await _ticketRepo.GetByIdIgnoringClientFilterAsync(cambio.TicketId.Value)
            : null;

        await _uow.BeginTransactionAsync();
        try
        {
            if (midMonth)
            {
                cambio.MidMonthChange = true;
                cambio.EffectiveDate  = hoy;
                await _proration.ApplyMidMonthAsync(client, cambio.NewPlan!, hoy);

                // Solo el cambio inmediato toca el plan aquí. Antes ChangePlan se ejecutaba
                // SIEMPRE, también en los diferidos: se aprobaba un downgrade "efectivo el 1ro
                // del mes siguiente" y el cliente perdía la velocidad ese mismo día, habiendo
                // pagado el mes completo del plan superior. Los diferidos los aplica
                // ApplyScheduledPlanChangesJob cuando llega EffectiveDate.
                client.ChangePlan(newPlan.Id);
                _clientRepo.Update(client);
            }

            cambio.Status        = midMonth ? PlanChangeStatus.Aplicado : PlanChangeStatus.Aprobado;
            cambio.ProcessedAt   = hoy;
            cambio.ProcessedById = actorId;
            _changeRepo.Update(cambio);
            if (ticket is not null)
            {
                ticket.Status            = TicketStatus.Resuelto;
                ticket.ResolutionMessage = midMonth
                    ? "Cambio de plan aprobado y ejecutado inmediatamente. Facturas proporcionales generadas."
                    : $"Cambio de plan aprobado. Efectivo el {cambio.EffectiveDate:dd/MM/yyyy}.";
                ticket.ResolvedAt = hoy;
                _ticketRepo.Update(ticket);
            }

            await _changeRepo.SaveChangesAsync();
            await _uow.CommitAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            await _uow.RollbackAsync();
            return Result<bool>.Failure(
                "El cliente fue modificado por otro proceso. Recargue la página e intente nuevamente.");
        }
        catch (Exception)
        {
            await _uow.RollbackAsync();
            throw;
        }

        // Las notificaciones son best-effort: un fallo aquí NO debe revertir un cambio ya confirmado.
        // Solo se avisa "tu plan cambió" cuando REALMENTE cambió. En un cambio diferido el aviso
        // lo manda ApplyScheduledPlanChangesJob al aplicarlo; anunciarlo aquí sería mentirle al
        // cliente durante todo el resto del mes.
        if (midMonth)
            await _planNotifier.NotifyApprovedAsync(client, newPlan, midMonth: true);

        await _audit.LogAsync("Clientes", "PLAN_CHANGE_APPROVED",
            $"Cambio de plan aprobado: {client.TbnCode} → {newPlan.Name}" +
            (midMonth ? " (mitad de mes)" : " (fin de mes)"),
            actorId, actorName, ip);

        return Result<bool>.Success(true);
    }


    public async Task<Result<bool>> RejectChangeAsync(
        Guid cambioId, string motivo,
        Guid actorId, string actorName, string ip)
    {
        var cambio = await _changeRepo.GetForCommandAsync(cambioId);

        if (cambio is null)
            return Result<bool>.Failure("Solicitud no encontrada.");
        if (cambio.Status != PlanChangeStatus.Pendiente)
            return Result<bool>.Failure("Esta solicitud ya fue procesada.");

        var ticket = cambio.TicketId.HasValue
            ? await _ticketRepo.GetByIdIgnoringClientFilterAsync(cambio.TicketId.Value)
            : null;

        var ahora = DateTime.UtcNow;
        await _uow.BeginTransactionAsync();
        try
        {
            cambio.Status          = PlanChangeStatus.Rechazado;
            cambio.RejectionReason = motivo;
            cambio.ProcessedAt     = ahora;
            cambio.ProcessedById   = actorId;
            _changeRepo.Update(cambio);
            if (ticket is not null)
            {
                ticket.Status            = TicketStatus.Cerrado;
                ticket.ResolutionMessage = $"Cambio de plan rechazado. Motivo: {motivo}";
                ticket.ClosedAt          = ahora;
                _ticketRepo.Update(ticket);
            }

            await _changeRepo.SaveChangesAsync();

            // OBS-01: el aviso NO es una llamada a WhatsApp, es un insert en
            // NotifOutbox — una escritura local. Va DENTRO de la transacción a
            // propósito, que es para lo que existe el patrón outbox: o se
            // rechaza la solicitud y se encola el aviso, o no ocurre ninguna de
            // las dos cosas.
            //
            // Antes iba después del commit y sin protección: si el insert
            // fallaba, el rechazo ya estaba guardado, el mensaje se perdía para
            // siempre —el worker no reintenta lo que nunca se escribió— y la
            // excepción se llevaba por delante el asiento de auditoría de más
            // abajo, dejando un rechazo aplicado sin rastro de quién lo hizo.
            if (cambio.Client is not null)
                await _planNotifier.NotifyRejectedAsync(
                    cambio.Client, cambio.NewPlan?.Name, motivo);

            await _uow.CommitAsync();
        }
        catch (Exception)
        {
            await _uow.RollbackAsync();
            throw;
        }

        // La auditoría queda fuera, como en el resto del código: si llegamos
        // aquí todo se confirmó, y un fallo del asiento no debe deshacerlo.
        await _audit.LogAsync("Clientes", "PLAN_CHANGE_REJECTED",
            $"Cambio de plan rechazado: {cambio.ClientId} — {motivo}",
            actorId, actorName, ip);

        return Result<bool>.Success(true);
    }
}
