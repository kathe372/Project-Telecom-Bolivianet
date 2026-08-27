using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.Infrastructure.Repositories;

public class ScheduleRepository : GenericRepository<BusinessSchedule>, IScheduleRepository
{
    private readonly AppDbContext _db;

    public ScheduleRepository(AppDbContext db) : base(db) => _db = db;

    // PASO 15 (2026-08): antes solo exigía IsActive — con más de un
    // BusinessSchedule activo, resolvía "el primero por orden de inserción",
    // que podía no coincidir con el que ya usa el cálculo de SLA
    // (TicketHelper.GetDueDateFromSlaAsync, que sí exige IsDefault && IsActive).
    public Task<BusinessSchedule?> GetActiveAsync(CancellationToken ct = default) =>
        _db.BusinessSchedules
           .Include(s => s.Holidays)
           .FirstOrDefaultAsync(s => s.IsActive && s.IsDefault, ct);

    public Task<BusinessSchedule?> GetActiveByIdAsync(Guid id, CancellationToken ct = default) =>
        _db.BusinessSchedules.AsNoTracking()
           .Include(s => s.Holidays)
           .FirstOrDefaultAsync(s => s.Id == id && s.IsActive, ct);

    public Task<List<BusinessSchedule>> GetAllWithHolidaysAsync(CancellationToken ct = default) =>
        _db.BusinessSchedules.AsNoTracking()
           .Include(s => s.Holidays)
           .OrderByDescending(s => s.IsDefault)
           .ThenBy(s => s.Name)
           .ToListAsync(ct);

    // Sin AsNoTracking: la pantalla de edición modifica lo que lee.
    public Task<BusinessSchedule?> GetWithHolidaysAsync(Guid id, CancellationToken ct = default) =>
        _db.BusinessSchedules
           .Include(s => s.Holidays)
           .FirstOrDefaultAsync(s => s.Id == id, ct);

    public Task<List<BusinessSchedule>> GetDefaultsAsync(CancellationToken ct = default) =>
        _db.BusinessSchedules.Where(s => s.IsDefault).ToListAsync(ct);
}
