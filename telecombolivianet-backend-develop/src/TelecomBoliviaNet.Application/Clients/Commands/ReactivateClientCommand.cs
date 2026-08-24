using MediatR;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Notifications;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Clients.Commands;

public record ReactivateClientCommand(
    Guid   ClientId,
    Guid   ActorId,
    string ActorName,
    string ClientIp) : IRequest<Result>;

public class ReactivateClientHandler : IRequestHandler<ReactivateClientCommand, Result>
{
    private readonly IClientRepository _clientRepo;
    private readonly AuditService               _audit;
    private readonly INotifPublisher            _notif;

    public ReactivateClientHandler(
        IClientRepository clientRepo,
        AuditService               audit,
        INotifPublisher            notif)
    {
        _clientRepo = clientRepo;
        _audit      = audit;
        _notif      = notif;
    }

    public async Task<Result> Handle(ReactivateClientCommand cmd, CancellationToken ct)
    {
        var client = await _clientRepo.GetWithPlanAsync(cmd.ClientId, ct);

        if (client is null) return Result.Failure("Cliente no encontrado.");
        if (client.Status == ClientStatus.Activo)
            return Result.Failure("El cliente ya está activo.");

        client.Reactivate();
        _clientRepo.Update(client);
        await _clientRepo.SaveChangesAsync();
        await _audit.LogAsync("Clientes", "CLIENT_REACTIVATED",
            $"Servicio reactivado: {client.TbnCode} — {client.FullName}",
            userId: cmd.ActorId, userName: cmd.ActorName, ip: cmd.ClientIp, entityId: client.Id);

        await _notif.PublishAsync(
            NotifType.REACTIVACION,
            client.Id,
            client.PhoneMain,
            new Dictionary<string, string>
            {
                ["nombre"] = client.FullName,
                ["plan"]   = client.Plan?.Name ?? "internet",
            });

        return Result.Success();
    }
}
