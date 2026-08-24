using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.Infrastructure.Repositories;

/// <summary>Implementación de <see cref="IInvoiceRepository"/>. Ver ADR-001.</summary>
public class InvoiceRepository : GenericRepository<Invoice>, IInvoiceRepository
{
    private readonly AppDbContext _db;

    public InvoiceRepository(AppDbContext db) : base(db) => _db = db;

    public Task<List<Invoice>> GetForClientYearAsync(
        Guid clientId, int year, CancellationToken ct = default)
        => _db.Invoices.AsNoTracking()
            .Where(i => i.ClientId == clientId
                     && (i.Year == year || i.Type == InvoiceType.Instalacion)
                     && i.Status != InvoiceStatus.Anulada)
            .OrderBy(i => i.Month)
            .ToListAsync(ct);

    public Task<List<InvoicePlanSnapshot>> GetPlanSnapshotsAsync(
        IReadOnlyCollection<Guid> invoiceIds, CancellationToken ct = default)
        => _db.Invoices.AsNoTracking()
            .Where(i => invoiceIds.Contains(i.Id))
            .Select(i => new InvoicePlanSnapshot(i.Id, i.PlanName, i.PlanPrice))
            .ToListAsync(ct);
}

/// <summary>Implementación de <see cref="IPaymentRepository"/>. Ver ADR-001.</summary>
public class PaymentRepository : GenericRepository<Payment>, IPaymentRepository
{
    private readonly AppDbContext _db;

    public PaymentRepository(AppDbContext db) : base(db) => _db = db;

    public Task<List<Payment>> GetHistoryForClientAsync(
        Guid clientId, CancellationToken ct = default)
        => _db.Payments.AsNoTracking()
            .Include(p => p.RegisteredBy)
            .Include(p => p.PaymentInvoices)
                .ThenInclude(pi => pi.Invoice)
            .Where(p => p.ClientId == clientId)
            .OrderByDescending(p => p.PaidAt)
            .ToListAsync(ct);
}
