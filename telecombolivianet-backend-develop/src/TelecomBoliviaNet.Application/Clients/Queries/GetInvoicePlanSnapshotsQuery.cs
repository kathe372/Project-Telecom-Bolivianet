using MediatR;
using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Clients.Queries;

/// <summary>
/// PASO 5 (2026-08): el chatbot necesita explicar por qué el monto de una
/// factura cambió respecto a otra — la causa más común en la práctica es un
/// cambio de plan entre un mes y otro. `Plan.Name`/`Amount` NO sirve para
/// esto porque reflejan el plan ACTUAL del cliente, no el que tenía vigente
/// en cada factura pasada. `Invoice.PlanName`/`PlanPrice` ya guardan ese
/// snapshot histórico (poblado en `BillingService.GenerateMonthlyInvoicesAsync`)
/// pero no viajaban a ningún endpoint que el bot consumiera.
///
/// Deliberadamente NO se tocó `GetClientInvoicesQuery`/`InvoiceDto` (uso del
/// panel admin) para no afectar ese consumidor — esta es una consulta
/// aparte, mínima, solo para el endpoint del bot.
/// </summary>
public record GetInvoicePlanSnapshotsQuery(IEnumerable<Guid> InvoiceIds)
    : IRequest<IEnumerable<InvoicePlanSnapshotDto>>;

public record InvoicePlanSnapshotDto(Guid InvoiceId, string? PlanName, decimal? PlanPrice);

public class GetInvoicePlanSnapshotsHandler
    : IRequestHandler<GetInvoicePlanSnapshotsQuery, IEnumerable<InvoicePlanSnapshotDto>>
{
    private readonly IGenericRepository<Invoice> _invoiceRepo;

    public GetInvoicePlanSnapshotsHandler(IGenericRepository<Invoice> invoiceRepo)
        => _invoiceRepo = invoiceRepo;

    public async Task<IEnumerable<InvoicePlanSnapshotDto>> Handle(
        GetInvoicePlanSnapshotsQuery q, CancellationToken ct)
    {
        var ids = q.InvoiceIds.ToList();
        if (ids.Count == 0) return [];

        return await _invoiceRepo.GetAll()
            .Where(i => ids.Contains(i.Id))
            .Select(i => new InvoicePlanSnapshotDto(i.Id, i.PlanName, i.PlanPrice))
            .ToListAsync(ct);
    }
}
