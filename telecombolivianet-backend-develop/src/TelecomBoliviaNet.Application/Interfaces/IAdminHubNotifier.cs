namespace TelecomBoliviaNet.Application.Interfaces;

public interface IAdminHubNotifier
{
    Task SendToAllAsync(string method, object payload);
}
