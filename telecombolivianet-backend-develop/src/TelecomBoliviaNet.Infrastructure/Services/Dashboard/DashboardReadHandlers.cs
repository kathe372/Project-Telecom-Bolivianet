using MediatR;
using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Application.Dashboard.Queries;
using TelecomBoliviaNet.Application.DTOs.Dashboard;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Payments;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Services;
using TelecomBoliviaNet.Infrastructure.Data;
using static TelecomBoliviaNet.Infrastructure.Services.Dashboard.DashboardTimeHelper;

namespace TelecomBoliviaNet.Infrastructure.Services.Dashboard;


public class GetDashKpisHandler : IRequestHandler<GetDashKpisQuery, DashboardKpisDto>
{
    private readonly AppDbContext _db;
    public GetDashKpisHandler(AppDbContext db) => _db = db;

    public async Task<DashboardKpisDto> Handle(GetDashKpisQuery _, CancellationToken ct)
    {
        var nowBo     = NowBo();
        var mesUtc    = StartOfMonthUtc(nowBo);
        var mesAntUtc = StartOfMonthUtc(nowBo.AddMonths(-1));
        var diaUtc    = StartOfDayUtc(nowBo);
        var nowUtc    = DateTime.UtcNow;

        var cs = await _db.Clients.GroupBy(_ => 1)
            .Select(g => new {
                Activos       = g.Count(c => c.Status == ClientStatus.Activo),
                Suspendidos   = g.Count(c => c.Status == ClientStatus.Suspendido),
                NuevosMes     = g.Count(c => c.CreatedAt >= mesUtc),
                CanceladosMes = g.Count(c => c.CancelledAt != null && c.CancelledAt >= mesUtc)
            }).FirstOrDefaultAsync(ct);

        var ps = await _db.Payments
            .Where(p => !p.IsVoided && p.PaidAt >= mesAntUtc)
            .GroupBy(_ => 1)
            .Select(g => new {
                TotalMes    = (decimal?)g.Where(p => p.PaidAt >= mesUtc).Sum(p => p.Amount),
                TotalMesAnt = (decimal?)g.Where(p => p.PaidAt < mesUtc).Sum(p => p.Amount)
            }).FirstOrDefaultAsync(ct);

        // Fuente única de deuda: antes se filtraba Vencida|Pendiente (los primeros días del mes
        // las facturas nuevas están Emitida, así que el KPI marcaba cero morosos) y se sumaba
        // Amount bruto (una factura abonada a medias se contaba entera).
        var unpaid = InvoiceDomainService.UnpaidStatuses;

        var r6 = await _db.Clients.CountAsync(
            c => c.Invoices.Any(i => unpaid.Contains(i.Status)), ct);

        var r7 = await _db.Invoices
            .Where(i => unpaid.Contains(i.Status))
            .SumAsync(i => (decimal?)(i.Amount - i.AmountPaid), ct) ?? 0m;

        var ts = await _db.SupportTickets.GroupBy(_ => 1)
            .Select(g => new {
                Abiertos = g.Count(t => t.Status == TicketStatus.Abierto || t.Status == TicketStatus.EnProceso || t.Status == TicketStatus.PendienteCliente),
                Criticos = g.Count(t => (t.Status == TicketStatus.Abierto || t.Status == TicketStatus.EnProceso || t.Status == TicketStatus.PendienteCliente) && t.Priority == TicketPriority.Critica),
                ResHoy   = g.Count(t => t.ResolvedAt != null && t.ResolvedAt >= diaUtc),
                VencSla  = g.Count(t => (t.Status == TicketStatus.Abierto || t.Status == TicketStatus.EnProceso) && t.DueDate != null && t.DueDate < nowUtc)
            }).FirstOrDefaultAsync(ct);

        var ws = await _db.WhatsAppReceipts.GroupBy(_ => 1)
            .Select(g => new {
                Pendientes = g.Count(r => r.Status == ReceiptQueueStatus.Pendiente),
                Hoy        = g.Count(r => r.ReceivedAt >= diaUtc)
            }).FirstOrDefaultAsync(ct);

        var activos = cs?.Activos ?? 0;
        var arpu    = activos > 0 ? Math.Round((ps?.TotalMes ?? 0m) / activos, 2) : 0m;

        return new DashboardKpisDto(
            activos, cs?.Suspendidos ?? 0, cs?.NuevosMes ?? 0,
            ps?.TotalMes ?? 0m, ps?.TotalMesAnt ?? 0m, r6, r7,
            ts?.Abiertos ?? 0, ts?.Criticos ?? 0, ts?.ResHoy ?? 0, ts?.VencSla ?? 0,
            ws?.Pendientes ?? 0, ws?.Hoy ?? 0,
            arpu,
            cs?.CanceladosMes ?? 0);
    }
}


public class GetCollectionsTrendHandler : IRequestHandler<GetCollectionsTrendQuery, CollectionsTrendDto>
{
    private readonly AppDbContext _db;
    public GetCollectionsTrendHandler(AppDbContext db) => _db = db;

    public async Task<CollectionsTrendDto> Handle(GetCollectionsTrendQuery q, CancellationToken ct)
    {
        var nowBo   = NowBo();
        var culture = new System.Globalization.CultureInfo("es-BO");
        var all     = new List<TendenciaMesDto>();

        for (int i = q.Meses - 1; i >= 0; i--)
        {
            var fecha = nowBo.AddMonths(-i);
            var ini   = StartOfMonthUtc(fecha);
            var fin   = StartOfMonthUtc(new DateTime(fecha.Year, fecha.Month, 1).AddMonths(1));
            var p     = await _db.Payments.Where(x => !x.IsVoided && x.PaidAt >= ini && x.PaidAt < fin)
                .GroupBy(_ => 1).Select(g => new { T = g.Sum(x => x.Amount), C = g.Count() })
                .FirstOrDefaultAsync(ct);
            all.Add(new TendenciaMesDto(Cap(fecha.ToString("MMM", culture)), Cap(fecha.ToString("MMMM yyyy", culture)), p?.T ?? 0m, p?.C ?? 0));
        }

        int first = all.FindIndex(m => m.Cantidad > 0);
        if (first == -1) return new CollectionsTrendDto(new List<TendenciaMesDto>());
        return new CollectionsTrendDto(first > 0 ? all.Skip(first).ToList() : all);
    }
}


public class GetMetodosPagoHandler : IRequestHandler<GetMetodosPagoQuery, List<MetodoPagoDto>>
{
    private readonly AppDbContext _db;
    public GetMetodosPagoHandler(AppDbContext db) => _db = db;

    public async Task<List<MetodoPagoDto>> Handle(GetMetodosPagoQuery _, CancellationToken ct)
    {
        var ini = StartOfMonthUtc(NowBo());
        return await _db.Payments.Where(p => !p.IsVoided && p.PaidAt >= ini)
            .GroupBy(p => p.Method)
            .Select(g => new MetodoPagoDto(g.Key.ToString(), g.Count(), g.Sum(p => p.Amount)))
            .ToListAsync(ct);
    }
}


public class GetRecentReceiptsHandler : IRequestHandler<GetRecentReceiptsQuery, List<RecentReceiptDto>>
{
    private readonly AppDbContext _db;
    public GetRecentReceiptsHandler(AppDbContext db) => _db = db;

    public async Task<List<RecentReceiptDto>> Handle(GetRecentReceiptsQuery q, CancellationToken ct)
        => await _db.Payments.Where(p => !p.IsVoided)
            .OrderByDescending(p => p.RegisteredAt).Take(q.Top)
            .Select(p => new RecentReceiptDto(p.Id, p.Client!.FullName, p.Amount, p.PaidAt, "Verificado", p.Method.ToString()))
            .ToListAsync(ct);
}


public class GetClientsByZoneHandler : IRequestHandler<GetClientsByZoneQuery, List<ClientsByZoneDto>>
{
    private readonly AppDbContext _db;
    public GetClientsByZoneHandler(AppDbContext db) => _db = db;

    public async Task<List<ClientsByZoneDto>> Handle(GetClientsByZoneQuery _, CancellationToken ct)
    {
        var unpaid = InvoiceDomainService.UnpaidStatuses;
        var raw = await _db.Clients.GroupBy(c => c.Zone)
            .Select(g => new {
                Zona     = g.Key, Total = g.Count(), Activos = g.Count(c => c.Status == ClientStatus.Activo),
                ConDeuda = g.Count(c => c.Invoices.Any(i => unpaid.Contains(i.Status)))
            }).OrderByDescending(g => g.Total).Take(8).ToListAsync(ct);
        return raw.Select(r => new ClientsByZoneDto(r.Zona, r.Total, r.Activos, r.ConDeuda)).ToList();
    }
}
