using TelecomBoliviaNet.Application.DTOs.Bot;

namespace TelecomBoliviaNet.Application.Interfaces;

public interface IBotConfigService
{
    Task<BotConfigDto>  GetAsync();
    Task<BotConfigDto>  UpdateAsync(BotConfigDto dto, Guid actorId, string actorName, string ip);
    BotConfigDto        GetDefault();
}
