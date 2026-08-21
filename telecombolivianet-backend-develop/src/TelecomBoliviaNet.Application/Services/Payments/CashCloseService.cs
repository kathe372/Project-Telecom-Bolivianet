using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.DTOs.Payments;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Payments;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Services.Payments;

public class CashCloseService : ICashCloseService
{
    private readonly IGenericRepository<CashClose>  _cashCloseRepo;
    private readonly IGenericRepository<Payment>    _paymentRepo;
    private readonly IGenericRepository<UserSystem> _userRepo;
    private readonly AuditService                   _audit;
    private readonly ILogger<CashCloseService>      _logger;

    public CashCloseService(
        IGenericRepository<CashClose>  cashCloseRepo,
        IGenericRepository<Payment>    paymentRepo,
        IGenericRepository<UserSystem> userRepo,
        AuditService                   audit,
        ILogger<CashCloseService>      logger)
    {
        _cashCloseRepo = cashCloseRepo;
        _paymentRepo   = paymentRepo;
        _userRepo      = userRepo;
        _audit         = audit;
        _logger        = logger;
    }

    public async Task<CashCloseDto> GetOrCreateActiveTurnoAsync(Guid userId, string userName)
    {
        var turnoActivo = await _cashCloseRepo.GetAll()
            .FirstOrDefaultAsync(c => c.UserId == userId && c.ClosedAt == null);

        if (turnoActivo is not null)
            return await BuildCashCloseDto(turnoActivo, isClosed: false);

        var nuevo = new CashClose { UserId = userId, StartedAt = DateTime.UtcNow };
        await _cashCloseRepo.AddAsync(nuevo);
        await _cashCloseRepo.SaveChangesAsync();
        return await BuildCashCloseDto(nuevo, isClosed: false);
    }

    public async Task<Result<CashCloseDto>> CerrarTurnoAsync(
        Guid userId, string userName, string ip)
    {
        var turno = await _cashCloseRepo.GetAll()
            .FirstOrDefaultAsync(c => c.UserId == userId && c.ClosedAt == null);

        if (turno is null)
            return Result<CashCloseDto>.Failure("No hay un turno activo para este operador.");

        var pagos = await _paymentRepo.GetAll()
            .Include(p => p.PaymentInvoices)
            .Where(p => p.RegisteredByUserId == userId
                     && p.RegisteredAt >= turno.StartedAt
                     && !p.IsVoided)
            .ToListAsync();

        var detalle = pagos
            .GroupBy(p => p.Method.ToString())
            .Select(g => new CashCloseChannelDetail(g.Key, g.Count(), g.Sum(p => p.Amount)))
            .ToList();

        turno.TotalAmount    = pagos.Sum(p => p.Amount);
        turno.DetailJson     = JsonSerializer.Serialize(detalle);
        turno.PagosValidados = pagos.Count;
        turno.ClosedAt       = DateTime.UtcNow;
        _cashCloseRepo.Update(turno);
        await _cashCloseRepo.SaveChangesAsync();
        await _audit.LogAsync("Pagos", "CASH_TURN_CLOSED",
            $"Turno cerrado: usuario={userName} total={turno.TotalAmount:F2}",
            userId: userId, userName: userName, ip: ip,
            newData: JsonSerializer.Serialize(new { TotalAmount = turno.TotalAmount, Pagos = pagos.Count }));

        return Result<CashCloseDto>.Success(await BuildCashCloseDto(turno, isClosed: true));
    }

    public async Task<List<CashCloseDto>> GetCashClosesAsync(
        Guid? userId, DateTime? desde, DateTime? hasta)
    {
        // AsNoTracking + proyección síncrona: antes esto era un Task.WhenAll de
        // métodos async sobre el MISMO DbContext — funcionaba de casualidad porque
        // la rama de cierres cerrados no tocaba la BD; el primer await real habría
        // lanzado "A second operation was started on this context".
        var query = _cashCloseRepo.GetAllReadOnly()
            .Include(c => c.User)
            .Where(c => c.ClosedAt != null);

        if (userId.HasValue) query = query.Where(c => c.UserId == userId.Value);
        if (desde.HasValue)  query = query.Where(c => c.ClosedAt >= desde.Value.ToUniversalTime());
        if (hasta.HasValue)  query = query.Where(c => c.ClosedAt <= hasta.Value.ToUniversalTime().AddDays(1));

        var list = await query.OrderByDescending(c => c.ClosedAt).ToListAsync();
        return list
            .Select(cc => MapClosedDto(cc, cc.TotalAmount, cc.PagosValidados, ParseDetail(cc)))
            .ToList();
    }

    private List<CashCloseChannelDetail> ParseDetail(CashClose cc)
    {
        try { return JsonSerializer.Deserialize<List<CashCloseChannelDetail>>(cc.DetailJson) ?? new(); }
        catch (Exception ex)
        {
            _logger.LogWarning(ex,
                "DetailJson corrupto en cierre de caja {CashCloseId} — se usa detalle vacío",
                cc.Id);
            return new();
        }
    }

    private async Task<CashCloseDto> BuildCashCloseDto(CashClose cc, bool isClosed)
    {
        if (isClosed)
            return MapClosedDto(cc, cc.TotalAmount, cc.PagosValidados, ParseDetail(cc));

        // Turno ABIERTO: los totales se calculan al vuelo y viven SOLO en el DTO.
        // Antes se escribían en la entidad trackeada (`cc.TotalAmount = ...`)
        // desde un método de lectura: cualquier SaveChanges posterior en el mismo
        // request persistía esos valores parciales como si fueran el cierre.
        var resumen = await _paymentRepo.GetAllReadOnly()
            .Where(p => p.RegisteredByUserId == cc.UserId
                     && p.RegisteredAt >= cc.StartedAt
                     && !p.IsVoided)
            .GroupBy(p => p.Method)
            .Select(g => new { Method = g.Key, Count = g.Count(), Total = g.Sum(p => p.Amount) })
            .ToListAsync();

        var detalle = resumen
            .Select(r => new CashCloseChannelDetail(r.Method.ToString(), r.Count, r.Total))
            .ToList();

        return new CashCloseDto(
            cc.Id, cc.UserId, cc.User?.FullName ?? "—",
            cc.StartedAt, cc.ClosedAt,
            resumen.Sum(r => r.Total), resumen.Sum(r => r.Count), cc.PagosRechazados,
            detalle, IsClosed: false, cc.PdfPath);
    }

    private static CashCloseDto MapClosedDto(
        CashClose cc, decimal total, int pagos, List<CashCloseChannelDetail> detalle) =>
        new(cc.Id, cc.UserId, cc.User?.FullName ?? "—",
            cc.StartedAt, cc.ClosedAt,
            total, pagos, cc.PagosRechazados,
            detalle, IsClosed: true, cc.PdfPath);
}
