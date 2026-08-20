using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Application.Constants;
using TelecomBoliviaNet.Application.DTOs.Common;
using TelecomBoliviaNet.Application.DTOs.Payments;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Services.Payments;

public class PaymentQueryService : IPaymentQueryService
{
    private readonly IGenericRepository<Payment>    _paymentRepo;
    private readonly IGenericRepository<UserSystem> _userRepo;

    public PaymentQueryService(
        IGenericRepository<Payment>    paymentRepo,
        IGenericRepository<UserSystem> userRepo)
    {
        _paymentRepo = paymentRepo;
        _userRepo    = userRepo;
    }

    public async Task<PagedResult<PaymentListItemDto>> GetAllAsync(PaymentFilterDto filter)
    {
        var query = _paymentRepo.GetAll()
            .Include(p => p.Client).ThenInclude(c => c!.Plan)
            .Include(p => p.RegisteredBy)
            .Include(p => p.PaymentInvoices).ThenInclude(pi => pi.Invoice)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(filter.Search))
        {
            var q = filter.Search.ToLower();
            query = query.Where(p =>
                p.Client != null && (p.Client.FullName.ToLower().Contains(q) ||
                                     p.Client.TbnCode.ToLower().Contains(q)));
        }

        if (!string.IsNullOrWhiteSpace(filter.Method) && filter.Method != "all")
            if (Enum.TryParse<PaymentMethod>(filter.Method, out var m))
                query = query.Where(p => p.Method == m);

        if (!string.IsNullOrWhiteSpace(filter.Origin))
        {
            var fromWa = filter.Origin == "WhatsApp";
            query = query.Where(p => p.FromWhatsApp == fromWa);
        }

        if (filter.From.HasValue)
            query = query.Where(p => p.PaidAt >= filter.From.Value.ToUniversalTime());

        if (filter.To.HasValue)
            query = query.Where(p => p.PaidAt <= filter.To.Value.ToUniversalTime().AddDays(1));

        query = query.OrderByDescending(p => p.PaidAt);

        var total    = await query.CountAsync();
        var payments = await query
            .Skip((filter.PageNumber - 1) * filter.PageSize)
            .Take(filter.PageSize)
            .ToListAsync();

        return new PagedResult<PaymentListItemDto>(
            payments.Select(MapToListItem), total, filter.PageNumber, filter.PageSize);
    }

    public async Task<PaymentDetailDto?> GetByIdAsync(Guid id)
    {
        var p = await _paymentRepo.GetAll()
            .Include(p => p.Client)
            .Include(p => p.RegisteredBy)
            .Include(p => p.PaymentInvoices).ThenInclude(pi => pi.Invoice)
            .FirstOrDefaultAsync(p => p.Id == id);

        if (p is null) return null;

        return new PaymentDetailDto(
            p.Id, p.ClientId,
            p.Client?.TbnCode   ?? "—",
            p.Client?.FullName  ?? "—",
            p.Client?.PhoneMain ?? "—",
            p.Amount, p.Method.ToString(), p.Bank, p.BankReference,
            p.PaidAt, p.RegisteredAt,
            p.RegisteredBy?.FullName ?? "Sistema",
            p.FromWhatsApp, p.ReceiptImageUrl, p.PhysicalReceiptNumber,
            BuildCoveredMonths(p),
            CanVoid:  (DateTime.UtcNow - p.RegisteredAt).TotalDays <= AppConstants.Security.VoidPaymentWindowDays,
            IsVoided: p.IsVoided);
    }

    public async Task<CollectionReportDto> GetCollectionReportAsync(DateTime from, DateTime to)
    {
        var utcFrom = from.ToUniversalTime();
        var utcTo   = to.ToUniversalTime().AddDays(1);

        var payments = await _paymentRepo.GetAll()
            .Include(p => p.Client).ThenInclude(c => c!.Plan)
            .Include(p => p.RegisteredBy)
            .Include(p => p.PaymentInvoices).ThenInclude(pi => pi.Invoice)
            .Where(p => p.PaidAt >= utcFrom && p.PaidAt < utcTo && !p.IsVoided)
            .ToListAsync();

        var total   = payments.Sum(p => p.Amount);
        var count   = payments.Count;
        var avg     = count > 0 ? Math.Round(total / count, 2) : 0;
        var cash    = payments.Where(p => p.Method == PaymentMethod.Efectivo).Sum(p => p.Amount);
        var deposit = payments.Where(p => p.Method == PaymentMethod.DepositoBancario).Sum(p => p.Amount);
        var qr      = payments.Where(p => p.Method == PaymentMethod.QR).Sum(p => p.Amount);

        var byUser = payments
            .GroupBy(p => p.RegisteredBy?.FullName ?? "Sistema")
            .Select(g => new CollectionByUserDto(g.Key, g.Count(), g.Sum(p => p.Amount)))
            .OrderByDescending(u => u.Total);

        return new CollectionReportDto(from, to, total, count, avg,
            cash, deposit, qr, byUser, payments.Select(MapToListItem));
    }

    public async Task<Result<CollectionReportByOperatorDto>> GetCollectionByOperatorAsync(
        DateTime from, DateTime to, Guid? operatorId)
    {
        var utcFrom = from.ToUniversalTime();
        var utcTo   = to.ToUniversalTime().AddDays(1);

        var query = _paymentRepo.GetAll()
            .Include(p => p.Client)
            .Include(p => p.RegisteredBy)
            .Include(p => p.PaymentInvoices).ThenInclude(pi => pi.Invoice)
            .Where(p => p.PaidAt >= utcFrom && p.PaidAt < utcTo && !p.IsVoided);

        if (operatorId.HasValue)
            query = query.Where(p => p.RegisteredByUserId == operatorId.Value);

        var payments  = await query.OrderByDescending(p => p.PaidAt).ToListAsync();
        var operators = await _userRepo.GetAll()
            .Where(u => !u.IsDeleted)
            .OrderBy(u => u.FullName)
            .Select(u => new OperatorDropdownDto(u.Id, u.FullName))
            .ToListAsync();

        return Result<CollectionReportByOperatorDto>.Success(new CollectionReportByOperatorDto(
            from, to,
            payments.Sum(p => p.Amount),
            payments.Count,
            operatorId.HasValue ? payments.FirstOrDefault()?.RegisteredBy?.FullName : null,
            payments.Select(p => new PaymentReportRowDto(
                p.Id, p.Client?.TbnCode ?? "—", p.Client?.FullName ?? "—",
                p.Amount, p.Method.ToString(), p.Bank, p.BankReference,
                p.PaidAt, p.RegisteredBy?.FullName ?? "Sistema",
                p.PhysicalReceiptNumber, p.FromWhatsApp)).ToList(),
            operators));
    }

    private static PaymentListItemDto MapToListItem(Payment p) =>
        new(p.Id, p.ClientId,
            p.Client?.TbnCode       ?? "—",
            p.Client?.FullName      ?? "—",
            p.Amount, p.Method.ToString(), p.Bank, p.BankReference,
            p.PaidAt, p.RegisteredAt,
            p.RegisteredBy?.FullName ?? "Sistema",
            p.FromWhatsApp, p.ReceiptImageUrl, p.PhysicalReceiptNumber,
            BuildCoveredMonths(p),
            p.Client?.Plan?.Name    ?? "—",
            p.IsVoided);

    private static readonly System.Globalization.CultureInfo _esCulture =
        System.Globalization.CultureInfo.GetCultureInfo("es-BO");

    private static IEnumerable<string> BuildCoveredMonths(Payment p) =>
        p.PaymentInvoices.Select(pi =>
        {
            if (pi.Invoice?.Type == InvoiceType.Instalacion) return "Instalación";
            if (pi.Invoice is null) return "—";
            var s = new DateTime(pi.Invoice.Year, pi.Invoice.Month, 1)
                        .ToString("MMMM yyyy", _esCulture);
            return char.ToUpper(s[0]) + s[1..];
        });
}
