using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Application.DTOs.Common;
using TelecomBoliviaNet.Application.DTOs.Invoices;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Services;

namespace TelecomBoliviaNet.Application.Services.Invoices;

/// <summary>
/// La grilla de Facturación: una página de facturas con sus filtros.
///
/// <para>Compone <c>IQueryable</c> a propósito — la pantalla filtra por siete
/// criterios opcionales y un método de repositorio por combinación sería peor.
/// Es la excepción que documenta ADR-001.</para>
/// </summary>
public class InvoiceQueryService : IInvoiceQueryService
{
    private readonly IGenericRepository<Invoice> _invoiceRepo;

    public InvoiceQueryService(IGenericRepository<Invoice> invoiceRepo)
        => _invoiceRepo = invoiceRepo;

    public async Task<PagedResult<InvoiceDetailDto>> GetPagedAsync(InvoiceFilterDto filter)
    {
        var query = InvoiceQuerySpecs.ApplyTypeFilter(
            _invoiceRepo.GetAll()
                .Include(i => i.Client).ThenInclude(c => c!.Plan)
                .Include(i => i.PaymentInvoices).ThenInclude(pi => pi.Payment)
                    .ThenInclude(p => p!.RegisteredBy),
            filter.Type);

        if (filter.Year.HasValue)
            query = query.Where(i => i.Year == filter.Year.Value);
        if (filter.Month.HasValue)
            query = query.Where(i => i.Month == filter.Month.Value);

        if (!string.IsNullOrWhiteSpace(filter.Status) && filter.Status != "all")
        {
            if (Enum.TryParse<InvoiceStatus>(filter.Status, out var status))
                query = query.Where(i => i.Status == status);
        }

        if (!string.IsNullOrWhiteSpace(filter.Search))
        {
            var q      = filter.Search.Trim();
            var qLower = q.ToLower();
            query = query.Where(i =>
                i.Client != null && (
                    i.Client.TbnCode == q ||
                    i.Client.TbnCode.ToLower().StartsWith(qLower) ||
                    i.Client.FullName.ToLower().Contains(qLower)));
        }

        if (filter.DateFrom.HasValue)
            query = query.Where(i => i.IssuedAt >= DateTime.SpecifyKind(filter.DateFrom.Value, DateTimeKind.Utc));
        if (filter.DateTo.HasValue)
            query = query.Where(i => i.IssuedAt <= DateTime.SpecifyKind(filter.DateTo.Value.AddDays(1), DateTimeKind.Utc));

        query = query.OrderBy(i => i.Client!.TbnCode);

        var total    = await query.CountAsync();
        var invoices = await query
            .Skip((filter.PageNumber - 1) * filter.PageSize)
            .Take(filter.PageSize)
            .ToListAsync();

        return new PagedResult<InvoiceDetailDto>(
            invoices.Select(InvoiceProjections.MapToDetail),
            total, filter.PageNumber, filter.PageSize);
    }
}
