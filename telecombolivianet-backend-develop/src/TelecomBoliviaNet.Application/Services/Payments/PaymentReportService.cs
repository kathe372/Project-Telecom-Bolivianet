using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.DTOs.Payments;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;
using TelecomBoliviaNet.Application.Constants;

namespace TelecomBoliviaNet.Application.Services.Payments;

/// <summary>
/// Los dos informes de recaudación, extraídos de <c>PaymentService</c> (F5).
///
/// <para>Ambos comparten la misma regla, y es la que importa: <b>los totales se
/// agregan en SQL sobre el rango completo; solo el detalle que se muestra está
/// acotado</b>. Antes se traían como mucho 5.000 pagos a memoria y se sumaba
/// sobre ese subconjunto, así que pasado ese umbral el informe devolvía un total
/// incorrecto sin avisar de nada.</para>
/// </summary>
public class PaymentReportService : IPaymentReportService
{
    /// <summary>Tope de filas del DETALLE. No afecta a los totales.</summary>
    private const int ReportMaxRows = 5_000;

    private readonly IGenericRepository<Payment>    _paymentRepo;
    private readonly IGenericRepository<UserSystem> _userRepo;
    private readonly ILogger<PaymentReportService>  _logger;

    public PaymentReportService(
        IGenericRepository<Payment>    paymentRepo,
        IGenericRepository<UserSystem> userRepo,
        ILogger<PaymentReportService>  logger)
    {
        _paymentRepo = paymentRepo;
        _userRepo    = userRepo;
        _logger      = logger;
    }

    public async Task<CollectionReportDto> GetCollectionReportAsync(DateTime from, DateTime to)
    {
        var utcFrom = from.ToUniversalTime();
        var utcTo   = to.ToUniversalTime().AddDays(1);

        var baseQuery = _paymentRepo.GetAll()
            .AsNoTracking()
            .Where(p => p.PaidAt >= utcFrom && p.PaidAt < utcTo && !p.IsVoided);

        var totals = await baseQuery
            .GroupBy(_ => 1)
            .Select(g => new
            {
                Total   = (decimal?)g.Sum(p => p.Amount) ?? 0m,
                Count   = g.Count(),
                Cash    = (decimal?)g.Where(p => p.Method == PaymentMethod.Efectivo).Sum(p => p.Amount) ?? 0m,
                Deposit = (decimal?)g.Where(p => p.Method == PaymentMethod.DepositoBancario).Sum(p => p.Amount) ?? 0m,
                Qr      = (decimal?)g.Where(p => p.Method == PaymentMethod.QR).Sum(p => p.Amount) ?? 0m,
            })
            .FirstOrDefaultAsync();

        var total = totals?.Total ?? 0m;
        var count = totals?.Count ?? 0;
        var avg   = count > 0 ? Math.Round(total / count, 2) : 0m;

        // El desglose por operador también se agrega en SQL.
        var byUser = await baseQuery
            .GroupBy(p => p.RegisteredBy != null ? p.RegisteredBy.FullName : "Sistema")
            .Select(g => new CollectionByUserDto(g.Key, g.Count(), g.Sum(p => p.Amount)))
            .OrderByDescending(u => u.Total)
            .ToListAsync();

        // El DETALLE sí se acota: es una lista para mostrar, no la base del total.
        var payments = await baseQuery
            .Include(p => p.Client).ThenInclude(c => c!.Plan)
            .Include(p => p.RegisteredBy)
            .Include(p => p.PaymentInvoices).ThenInclude(pi => pi.Invoice)
            .OrderByDescending(p => p.PaidAt)
            .Take(ReportMaxRows)
            .ToListAsync();

        if (count > ReportMaxRows)
        {
            _logger.LogInformation(
                "Reporte de recaudación {From:d}–{To:d}: {Count} pagos, detalle limitado a {Max}. " +
                "Los totales cubren el rango completo.", from, to, count, ReportMaxRows);
        }

        return new CollectionReportDto(
            from, to, total, count, avg,
            totals?.Cash ?? 0m, totals?.Deposit ?? 0m, totals?.Qr ?? 0m,
            byUser,
            payments.Select(PaymentMapper.ToListItem));
    }

    public async Task<Result<CollectionReportByOperatorDto>> GetCollectionByOperatorAsync(
        DateTime from, DateTime to, Guid? operatorId)
    {
        var utcFrom = from.ToUniversalTime();
        var utcTo   = to.ToUniversalTime().AddDays(1);

        var query = _paymentRepo.GetAll()
            .AsNoTracking()
            .Where(p => p.PaidAt >= utcFrom && p.PaidAt < utcTo && !p.IsVoided);

        if (operatorId.HasValue)
            query = query.Where(p => p.RegisteredByUserId == operatorId.Value);

        // Igual que en el informe general: los totales se agregan en SQL sobre el
        // rango completo, y solo el detalle mostrado se limita.
        var totals = await query
            .GroupBy(_ => 1)
            .Select(g => new { Total = (decimal?)g.Sum(p => p.Amount) ?? 0m, Count = g.Count() })
            .FirstOrDefaultAsync();

        var payments = await query
            .Include(p => p.Client)
            .Include(p => p.RegisteredBy)
            .Include(p => p.PaymentInvoices).ThenInclude(pi => pi.Invoice)
            .OrderByDescending(p => p.PaidAt)
            .Take(ReportMaxRows)
            .ToListAsync();

        var operators = await _userRepo.GetAll()
            .AsNoTracking()
            .Where(u => !u.IsDeleted)
            .OrderBy(u => u.FullName)
            .Select(u => new OperatorDropdownDto(u.Id, u.FullName))
            .ToListAsync();

        return Result<CollectionReportByOperatorDto>.Success(new CollectionReportByOperatorDto(
            from, to,
            totals?.Total ?? 0m,
            totals?.Count ?? 0,
            operatorId.HasValue
                ? operators.FirstOrDefault(o => o.Id == operatorId.Value)?.Name
                : null,
            payments.Select(p => new PaymentReportRowDto(
                p.Id,
                p.Client?.TbnCode   ?? AppConstants.Display.SinDato,
                p.Client?.FullName  ?? AppConstants.Display.SinDato,
                p.Amount,
                p.Method.ToString(),
                p.Bank,
                p.BankReference,
                p.PaidAt,
                p.RegisteredBy?.FullName ?? "Sistema",
                p.PhysicalReceiptNumber,
                p.FromWhatsApp
            )).ToList(),
            operators
        ));
    }
}
