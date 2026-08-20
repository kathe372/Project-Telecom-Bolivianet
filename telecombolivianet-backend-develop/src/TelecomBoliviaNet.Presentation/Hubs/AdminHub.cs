using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace TelecomBoliviaNet.Presentation.Hubs;


[Authorize(Policy = "AdminOrTecnico")]
public class AdminHub : Hub
{
    private readonly ILogger<AdminHub> _logger;

    public AdminHub(ILogger<AdminHub> logger)
    {
        _logger = logger;
    }

    public override async Task OnConnectedAsync()
    {
        var user = Context.User?.Identity?.Name ?? "desconocido";
        _logger.LogInformation("AdminHub: {User} conectado — ConnectionId: {Id}",
            user, Context.ConnectionId);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var user = Context.User?.Identity?.Name ?? "desconocido";
        _logger.LogInformation("AdminHub: {User} desconectado — {Id}",
            user, Context.ConnectionId);
        await base.OnDisconnectedAsync(exception);
    }

    public async Task Ping()
    {
        await Clients.Caller.SendAsync("Pong", DateTimeOffset.UtcNow.ToUnixTimeSeconds());
    }
}
