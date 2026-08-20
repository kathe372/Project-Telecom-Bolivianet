namespace TelecomBoliviaNet.Application.Interfaces;

public interface ITbnService
{
    Task<string> GenerateNextAsync();

    Task<string> PeekNextAsync();
}
