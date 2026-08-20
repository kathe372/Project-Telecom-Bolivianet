using TelecomBoliviaNet.Domain.Entities.Tickets;

namespace TelecomBoliviaNet.Domain.Interfaces;

public interface IScheduleRepository
{
    Task<BusinessSchedule?> GetActiveAsync(CancellationToken ct = default);
}
