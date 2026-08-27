using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Application.Constants;
using TelecomBoliviaNet.Application.DTOs.Common;
using TelecomBoliviaNet.Application.DTOs.Payments;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Payments;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Services.Payments;

/// <summary>
/// Las tres lecturas del módulo de Pagos, extraídas de <c>PaymentService</c> (F5).
///
/// <para>Existía ya un archivo con este nombre, pero era una copia anterior a las
/// correcciones de rendimiento del informe y no la usaba nadie: se eliminó (D-20)
/// y la extracción se rehízo desde el código vigente.</para>
///
/// <para>Compone <c>IQueryable</c> a propósito: el listado filtra por seis
/// criterios opcionales y un método de repositorio por combinación sería peor
/// que esto. Es la excepción que documenta ADR-001.</para>
/// </summary>
public class PaymentQueryService : IPaymentQueryService
{
    private readonly IGenericRepository<Payment>        _paymentRepo;
    private readonly IGenericRepository<PaymentReceipt> _receiptRepo;

    public PaymentQueryService(
        IGenericRepository<Payment>        paymentRepo,
        IGenericRepository<PaymentReceipt> receiptRepo)
    {
        _paymentRepo = paymentRepo;
        _receiptRepo = receiptRepo;
    }

    public Task<PaymentReceipt?> GetReceiptByPaymentAsync(Guid paymentId)
        => _receiptRepo.GetAll().FirstOrDefaultAsync(r => r.PaymentId == paymentId);

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
            payments.Select(PaymentMapper.ToListItem), total, filter.PageNumber, filter.PageSize);
    }

    public async Task<PaymentDetailDto?> GetByIdAsync(Guid id)
    {
        var p = await _paymentRepo.GetAll()
            .Include(p => p.Client)
            .Include(p => p.RegisteredBy)
            .Include(p => p.PaymentInvoices).ThenInclude(pi => pi.Invoice)
            .FirstOrDefaultAsync(p => p.Id == id);

        if (p is null) return null;

        // Misma constante que usa la validación real de la anulación. Antes aquí
        // había un 30 literal: si alguien cambiaba VoidPaymentWindowDays, la UI
        // seguía ofreciendo "Anular" durante 30 días y el backend lo rechazaba.
        var canVoid = (DateTime.UtcNow - p.RegisteredAt).TotalDays
                      <= AppConstants.Security.VoidPaymentWindowDays;

        return new PaymentDetailDto(
            p.Id, p.ClientId,
            p.Client?.TbnCode   ?? "—",
            p.Client?.FullName  ?? "—",
            p.Client?.PhoneMain ?? "—",
            p.Amount, p.Method.ToString(), p.Bank, p.BankReference,
            p.PaidAt, p.RegisteredAt,
            p.RegisteredBy?.FullName ?? "Sistema",
            p.FromWhatsApp, p.ReceiptImageUrl, p.PhysicalReceiptNumber,
            PaymentMapper.CoveredMonths(p), canVoid, p.IsVoided);
    }

    public async Task<DuplicateCheckResultDto> CheckDuplicateAsync(
        Guid clientId, decimal amount, DateTime paidAt)
    {
        var threeDaysAgo = paidAt.AddDays(-3).ToUniversalTime();
        var paidAtUtc    = paidAt.ToUniversalTime().AddDays(1);

        var existing = await _paymentRepo.GetAll()
            .Include(p => p.RegisteredBy)
            .Where(p => p.ClientId == clientId
                     && p.Amount   == amount
                     && p.PaidAt   >= threeDaysAgo
                     && p.PaidAt   <= paidAtUtc
                     && p.Amount   > 0
                     // Un pago ANULADO no es un duplicado: sin este filtro, tras
                     // anular un pago mal registrado el sistema bloqueaba volver a
                     // registrarlo corregido.
                     && !p.IsVoided)
            .FirstOrDefaultAsync();

        if (existing is null)
            return new DuplicateCheckResultDto(false, null, null, null, null, null);

        return new DuplicateCheckResultDto(
            true, existing.Id, existing.PaidAt, existing.Amount,
            existing.Method.ToString(), existing.RegisteredBy?.FullName);
    }
}
