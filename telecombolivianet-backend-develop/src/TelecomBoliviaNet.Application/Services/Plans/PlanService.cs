using TelecomBoliviaNet.Application.DTOs.Plans;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Notifications;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

#pragma warning disable CS8981
using r = TelecomBoliviaNet.Domain.Primitives.Result;
#pragma warning restore CS8981

namespace TelecomBoliviaNet.Application.Services.Plans;

public class PlanService : IPlanService
{
    private readonly IGenericRepository<Plan>        _repo;
    private readonly IGenericRepository<Client>      _clientRepo;
    private readonly IGenericRepository<PlanHistory> _histRepo;
    private readonly AuditService                    _audit;
    private readonly INotifPublisher                 _notif;

    public PlanService(
        IGenericRepository<Plan>        repo,
        IGenericRepository<Client>      clientRepo,
        IGenericRepository<PlanHistory> histRepo,
        AuditService                    audit,
        INotifPublisher                 notif)
    {
        _repo       = repo;
        _clientRepo = clientRepo;
        _histRepo   = histRepo;
        _audit      = audit;
        _notif      = notif;
    }

    public async Task<IEnumerable<PlanDto>> GetAllAsync(bool onlyActive = false)
    {
        var plans = onlyActive
            ? await _repo.ListAsync(p => p.IsActive)
            : await _repo.ListAsync();
        return plans.OrderBy(p => p.SpeedMb).Select(MapToDto);
    }

    public async Task<PlanDto?> GetByIdAsync(Guid id)
    {
        var plan = await _repo.GetByIdAsync(id);
        return plan is null ? null : MapToDto(plan);
    }

    public async Task<Result<PlanDto>> CreateAsync(
        CreatePlanDto dto, Guid adminId, string adminName, string ip)
    {
        var exists = await _repo.AnyAsync(p =>
            p.Name == dto.Name && p.SpeedMb == dto.SpeedMb);
        if (exists)
            return Result<PlanDto>.Failure($"Ya existe un plan llamado '{dto.Name}' con {dto.SpeedMb} Mb.");

        var plan = new Plan
        {
            Name         = dto.Name.Trim(),
            SpeedMb      = dto.SpeedMb,
            MonthlyPrice = dto.MonthlyPrice,
            IsActive     = true,
            CreatedAt    = DateTime.UtcNow
        };

        await _repo.AddAsync(plan);
        await _repo.SaveChangesAsync();
        await _audit.LogAsync("Planes", "PLAN_CREATED",
            $"Plan creado: {plan.DisplayLabel}",
            userId: adminId, userName: adminName, ip: ip);

        return Result<PlanDto>.Success(MapToDto(plan));
    }

    public async Task<Result<PlanDto>> UpdateAsync(
        Guid id, UpdatePlanDto dto, Guid adminId, string adminName, string ip)
    {
        var plan = await _repo.GetByIdAsync(id);
        if (plan is null) return Result<PlanDto>.Failure("Plan no encontrado.");

        if (!dto.IsActive && plan.IsActive)
        {
            var clientesActivos = await _clientRepo.CountAsync(
                c => c.PlanId == id
                  && c.Status != ClientStatus.DadoDeBaja
                  && !c.IsDeleted);
            if (clientesActivos > 0)
                return Result<PlanDto>.Failure(
                    $"No se puede desactivar el plan '{plan.Name}': " +
                    $"{clientesActivos} cliente(s) activo(s) lo tienen asignado. " +
                    $"Migre los clientes primero.");
        }

        var prev         = plan.DisplayLabel;
        var prevPrice    = plan.MonthlyPrice;
        var priceChanged = plan.MonthlyPrice != dto.MonthlyPrice;

        var snapshot = new PlanHistory
        {
            PlanId        = plan.Id,
            Name          = plan.Name,
            SpeedMb       = plan.SpeedMb,
            MonthlyPrice  = plan.MonthlyPrice,
            IsActive      = plan.IsActive,
            ChangedAt     = DateTime.UtcNow,
            ChangedById   = adminId,
            ChangedByName = adminName,
            ChangeReason  = dto.ChangeReason?.Trim(),
        };
        await _histRepo.AddAsync(snapshot);
        await _histRepo.SaveChangesAsync();

        plan.Name         = dto.Name.Trim();
        plan.SpeedMb      = dto.SpeedMb;
        plan.MonthlyPrice = dto.MonthlyPrice;
        plan.IsActive     = dto.IsActive;
        plan.UpdatedAt    = DateTime.UtcNow;

        _repo.Update(plan);

        await _repo.SaveChangesAsync();
        await _audit.LogAsync("Planes", "PLAN_UPDATED",
            $"Plan actualizado: {prev} → {plan.DisplayLabel}",
            userId: adminId, userName: adminName, ip: ip,
            prevData: $"{{\"precio\":{prevPrice}}}",
            newData:  $"{{\"precio\":{dto.MonthlyPrice}}}");

        if (priceChanged)
        {
            var clientes = await _clientRepo.ListReadOnlyAsync(
                c => c.PlanId == id && c.Status == ClientStatus.Activo);

            foreach (var cliente in clientes)
            {
                await _notif.PublishAsync(
                    NotifType.CAMBIO_PRECIO,
                    cliente.Id,
                    cliente.PhoneMain,
                    new Dictionary<string, string>
                    {
                        ["nombre"]       = cliente.FullName,
                        ["plan"]         = plan.Name,
                        ["precio_nuevo"] = dto.MonthlyPrice.ToString("N0"),
                    });
            }
        }

        return Result<PlanDto>.Success(MapToDto(plan));
    }

    public async Task<List<PlanHistoryDto>> GetHistoryAsync(Guid planId)
    {
        var entries = await _histRepo.ListReadOnlyAsync(h => h.PlanId == planId);

        return entries
            .OrderByDescending(h => h.ChangedAt)
            .Select(MapHistoryToDto)
            .ToList();
    }

    private static PlanDto MapToDto(Plan p) => new(
        p.Id, p.Name, p.SpeedMb, p.MonthlyPrice, p.IsActive, p.DisplayLabel);

    private static PlanHistoryDto MapHistoryToDto(PlanHistory h) => new(
        h.Id,
        h.PlanId,
        h.Name,
        h.SpeedMb,
        h.MonthlyPrice,
        h.IsActive,
        DisplayLabel: $"{h.Name} — {h.SpeedMb} Mb — Bs. {h.MonthlyPrice:N0}/mes",
        ChangedAt:    h.ChangedAt.ToString("O"),
        h.ChangedByName,
        h.ChangeReason);
}
