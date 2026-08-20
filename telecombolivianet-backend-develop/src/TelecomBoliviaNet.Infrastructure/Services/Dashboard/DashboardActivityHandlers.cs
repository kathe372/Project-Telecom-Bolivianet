using MediatR;
using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Application.Dashboard.Queries;
using TelecomBoliviaNet.Application.DTOs.Dashboard;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Services;
using TelecomBoliviaNet.Infrastructure.Data;
using static TelecomBoliviaNet.Infrastructure.Services.Dashboard.DashboardTimeHelper;

namespace TelecomBoliviaNet.Infrastructure.Services.Dashboard;


public class GetWhatsAppActivityHandler : IRequestHandler<GetWhatsAppActivityQuery, List<WhatsAppActivityDto>>
{
    private readonly AppDbContext _db;
    public GetWhatsAppActivityHandler(AppDbContext db) => _db = db;

    public async Task<List<WhatsAppActivityDto>> Handle(GetWhatsAppActivityQuery q, CancellationToken ct)
    {
        var ini = StartOfDayUtc(NowBo());
        var raw = await _db.WhatsAppReceipts
            .Where(r => r.ReceivedAt >= ini)
            .OrderByDescending(r => r.ReceivedAt).Take(q.Top)
            .Select(r => new { r.ReceivedAt, ClienteNombre = r.Client!.FullName, r.Status, r.DeclaredAmount })
            .ToListAsync(ct);
        return raw.Select(r => new WhatsAppActivityDto(UtcToBoHHmm(r.ReceivedAt), r.ClienteNombre, r.Status.ToString(), r.DeclaredAmount)).ToList();
    }
}


public class GetDebtorsHandler : IRequestHandler<GetDebtorsQuery, List<DebtorItemDto>>
{
    private readonly AppDbContext _db;
    public GetDebtorsHandler(AppDbContext db) => _db = db;

    public async Task<List<DebtorItemDto>> Handle(GetDebtorsQuery _, CancellationToken ct)
    {
        var hoy = DateTime.UtcNow;
        // Deuda = InvoiceDomainService.UnpaidStatuses sobre el SALDO (Amount − AmountPaid).
        // Antes se filtraba Vencida|Pendiente y se sumaba el monto bruto: el top de deudores
        // ignoraba a quien tenía facturas recién emitidas y sobrestimaba a quien pagó a medias.
        var unpaid = InvoiceDomainService.UnpaidStatuses;
        var raw = await _db.Clients
            .Where(c => c.Invoices.Any(i => unpaid.Contains(i.Status)))
            .Select(c => new {
                c.Id, c.FullName, c.Zone,
                Monto    = c.Invoices.Where(i => unpaid.Contains(i.Status)).Sum(i => i.Amount - i.AmountPaid),
                Vencidas = c.Invoices.Count(i => i.Status == InvoiceStatus.Vencida),
                Earliest = c.Invoices.Where(i => i.Status == InvoiceStatus.Vencida).OrderBy(i => i.DueDate).Select(i => (DateTime?)i.DueDate).FirstOrDefault()
            }).ToListAsync(ct);

        return raw.Select(c => new DebtorItemDto(c.Id, c.FullName, c.Zone, c.Monto,
            c.Earliest.HasValue ? Math.Max(0, (int)(hoy - c.Earliest.Value).TotalDays) : 0, c.Vencidas))
            .OrderByDescending(d => d.DiasVencido).ToList();
    }
}


public class GetActivityHoursHandler : IRequestHandler<GetActivityHoursQuery, List<ActivityHourDto>>
{
    private readonly AppDbContext _db;
    public GetActivityHoursHandler(AppDbContext db) => _db = db;

    public async Task<List<ActivityHourDto>> Handle(GetActivityHoursQuery _, CancellationToken ct)
    {
        var nowBo = NowBo();
        var ini   = StartOfDayUtc(nowBo);
        var fin   = ini.AddDays(1);

        var pH = await _db.Payments.Where(p => p.PaidAt >= ini && p.PaidAt < fin).Select(p => p.PaidAt.Hour).ToListAsync(ct);
        var tH = await _db.SupportTickets.Where(t => t.CreatedAt >= ini && t.CreatedAt < fin).Select(t => t.CreatedAt.Hour).ToListAsync(ct);
        var wH = await _db.WhatsAppReceipts.Where(r => r.ReceivedAt >= ini && r.ReceivedAt < fin).Select(r => r.ReceivedAt.Hour).ToListAsync(ct);

        var pBo = pH.Select(UtcHourToBo).ToList();
        var tBo = tH.Select(UtcHourToBo).ToList();
        var wBo = wH.Select(UtcHourToBo).ToList();

        return Enumerable.Range(0, 24)
            .Select(h => new ActivityHourDto(h, pBo.Count(x => x == h), tBo.Count(x => x == h), wBo.Count(x => x == h)))
            .ToList();
    }
}
