using MediatR;
using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Payments.Events;

/// <summary>
/// Regla de negocio (2026-07-07): al saldar la deuda de un cliente suspendido NO se
/// reactiva automáticamente; se genera una solicitud/alerta para que el admin apruebe
/// la reactivación con el flujo existente (botón "Reactivar").
/// </summary>
public class SuggestReactivationOnDebtClearedHandler
    : INotificationHandler<PaymentRegisteredEvent>
{
    private readonly IGenericRepository<Client> _clientRepo;
    private readonly IInternalAlertService      _alerts;

    public SuggestReactivationOnDebtClearedHandler(
        IGenericRepository<Client> clientRepo,
        IInternalAlertService      alerts)
    {
        _clientRepo = clientRepo;
        _alerts     = alerts;
    }

    public async Task Handle(PaymentRegisteredEvent e, CancellationToken ct)
    {
        var client = await _clientRepo.GetAll()
            .Include(c => c.Invoices)
            .FirstOrDefaultAsync(c => c.Id == e.ClientId, ct);

        if (client is null || client.Status != ClientStatus.Suspendido)
            return;

        if (client.Invoices.Any(i => i.IsUnpaid))
            return; // aún debe: no se sugiere reactivación

        await _alerts.CreateForRoleAsync(
            role:    "Admin",
            type:    "REACTIVACION_SUGERIDA",
            title:   $"Cliente al día — {client.TbnCode}",
            message: $"{client.FullName} saldó su deuda. ¿Reactivar el servicio?",
            link:    $"/clients/{client.Id}");
    }
}
