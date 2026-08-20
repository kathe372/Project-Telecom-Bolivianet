using Microsoft.AspNetCore.SignalR;
using TelecomBoliviaNet.Application.Interfaces;

namespace TelecomBoliviaNet.Presentation.Hubs;

public sealed class AdminHubNotifier : IAdminHubNotifier
{
    private readonly IHubContext<AdminHub> _hub;
    public AdminHubNotifier(IHubContext<AdminHub> hub) => _hub = hub;
    public Task SendToAllAsync(string method, object payload)
        => _hub.Clients.All.SendAsync(method, payload);
}
