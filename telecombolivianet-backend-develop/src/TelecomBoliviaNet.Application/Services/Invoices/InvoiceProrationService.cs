using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Application.Constants;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Services;

namespace TelecomBoliviaNet.Application.Services.Invoices;

public class InvoiceProrationService
{
    private readonly IGenericRepository<Invoice> _invoiceRepo;
    private readonly ICreditLedger               _creditLedger;

    public InvoiceProrationService(
        IGenericRepository<Invoice> invoiceRepo,
        ICreditLedger               creditLedger)
    {
        _invoiceRepo  = invoiceRepo;
        _creditLedger = creditLedger;
    }

    public async Task ApplyMidMonthAsync(Client client, Plan newPlan, DateTime hoy)
    {
        int daysInMonth = DateTime.DaysInMonth(hoy.Year, hoy.Month);
        int daysPlanOld = hoy.Day - 1;
        int daysPlanNew = daysInMonth - hoy.Day + 1;

        // Anti prorrata doble: anula la mensualidad Y cualquier prorrata previa del mismo mes,
        // para que un segundo cambio en el mismo ciclo no apile facturas proporcionales.
        //
        // El filtro usa InvoiceDomainService.UnpaidStatuses (fuente única): antes solo cubría
        // Pendiente|Emitida|Enviada, y la mensualidad pasa a Vencida el día 6 — es decir, en el
        // escenario más común de un cambio "a mitad de mes" la mensualidad NO se anulaba y el
        // cliente recibía el mes completo MÁS las dos prorratas del mismo periodo.
        var unpaid = InvoiceDomainService.UnpaidStatuses;
        var toAnnul = await _invoiceRepo.GetAll()
            .Where(i =>
                i.ClientId == client.Id &&
                i.Year     == hoy.Year  &&
                i.Month    == hoy.Month &&
                (i.Type == InvoiceType.Mensualidad      ||
                 i.Type == InvoiceType.ProrrataAnterior ||
                 i.Type == InvoiceType.ProrrataNueva)   &&
                unpaid.Contains(i.Status))
            .ToListAsync();

        foreach (var inv in toAnnul)
        {
            var nota = $"Anulada por cambio de plan a mitad de mes ({hoy:dd/MM/yyyy})";

            // Al ampliarse el filtro entran facturas con abonos (ParcialmentePagada, o Vencida
            // con pago parcial). Anularlas sin más se quedaría con ese dinero: lo abonado vuelve
            // al cliente como saldo a favor, con su asiento en el libro mayor, y se consumirá
            // solo contra las prorratas que se emiten a continuación.
            if (inv.AmountPaid > 0)
            {
                await _creditLedger.RecordAsync(
                    client, inv.AmountPaid, CreditMovementType.Reversion,
                    invoiceId: inv.Id,
                    notes: $"Devolución de lo abonado en la factura " +
                           $"{inv.InvoiceNumber ?? inv.Id.ToString()} al anularla por cambio de plan");
                nota += $" — Bs. {inv.AmountPaid:F2} abonados devueltos como saldo a favor";
            }

            inv.Status    = InvoiceStatus.Anulada;
            inv.Notes     = string.IsNullOrWhiteSpace(inv.Notes) ? nota : $"{inv.Notes}\n{nota}";
            inv.UpdatedAt = hoy;
            await _invoiceRepo.MarkModifiedAsync(inv);
        }

        var dueDate = new DateTime(hoy.Year, hoy.Month, 5, 0, 0, 0, DateTimeKind.Utc);
        if (dueDate < hoy) dueDate = hoy.AddDays(AppConstants.Time.InvoiceDueDays);

        if (daysPlanOld > 0 && client.Plan is not null)
        {
            await _invoiceRepo.AddAsync(new Invoice
            {
                ClientId  = client.Id,
                Type      = InvoiceType.ProrrataAnterior,
                Status    = InvoiceStatus.Pendiente,
                Year      = hoy.Year,
                Month     = hoy.Month,
                Amount    = Math.Round(client.Plan.MonthlyPrice * daysPlanOld / daysInMonth, 2),
                IssuedAt  = hoy,
                DueDate   = dueDate,
                Notes     = $"Proporcional {client.Plan.Name}: {daysPlanOld} de {daysInMonth} días",
                PlanName  = client.Plan.Name,
                PlanPrice = client.Plan.MonthlyPrice,
            });
        }

        if (daysPlanNew > 0)
        {
            await _invoiceRepo.AddAsync(new Invoice
            {
                ClientId  = client.Id,
                Type      = InvoiceType.ProrrataNueva,
                Status    = InvoiceStatus.Pendiente,
                Year      = hoy.Year,
                Month     = hoy.Month,
                Amount    = Math.Round(newPlan.MonthlyPrice * daysPlanNew / daysInMonth, 2),
                IssuedAt  = hoy,
                DueDate   = dueDate,
                Notes     = $"Proporcional {newPlan.Name}: {daysPlanNew} de {daysInMonth} días",
                PlanName  = newPlan.Name,
                PlanPrice = newPlan.MonthlyPrice,
            });
        }
    }

    public static (int OldDays, int NewDays, DateTime DueDate) CalculateSplit(DateTime hoy)
    {
        int daysInMonth = DateTime.DaysInMonth(hoy.Year, hoy.Month);
        var dueDate     = new DateTime(hoy.Year, hoy.Month, 5, 0, 0, 0, DateTimeKind.Utc);
        if (dueDate < hoy) dueDate = hoy.AddDays(AppConstants.Time.InvoiceDueDays);
        return (hoy.Day - 1, daysInMonth - hoy.Day + 1, dueDate);
    }
}
