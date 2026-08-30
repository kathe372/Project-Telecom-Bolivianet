using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Application.Constants;
using TelecomBoliviaNet.Application.DTOs.Clients;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Services.Clients;

/// <summary>
/// Lo que se le cobra a un cliente al darlo de alta: el cargo de instalación,
/// las mensualidades retroactivas si su instalación es anterior a hoy, y el pago
/// que cubre lo que abonó en el mostrador.
///
/// <para>Eran sesenta líneas dentro de <c>RegisterClientHandler</c> (F5), que
/// arrastraba cuatro dependencias solo para esto. El alta pasa a ocuparse de dar
/// de alta.</para>
///
/// <para>No abre ni confirma transacción: se llama <b>dentro</b> de la del alta,
/// porque un cliente registrado sin sus cargos —o unos cargos sin cliente— no es
/// un estado que deba existir.</para>
/// </summary>
public class InitialChargesService : IInitialChargesService
{
    private readonly IGenericRepository<Invoice>        _invoiceRepo;
    private readonly IGenericRepository<Payment>        _paymentRepo;
    private readonly IGenericRepository<PaymentInvoice> _piRepo;
    private readonly IInvoiceBackfillService            _backfill;

    public InitialChargesService(
        IGenericRepository<Invoice>        invoiceRepo,
        IGenericRepository<Payment>        paymentRepo,
        IGenericRepository<PaymentInvoice> piRepo,
        IInvoiceBackfillService            backfill)
    {
        _invoiceRepo = invoiceRepo;
        _paymentRepo = paymentRepo;
        _piRepo      = piRepo;
        _backfill    = backfill;
    }

    public async Task ApplyAsync(
        Client            client,
        Plan              plan,
        RegisterClientDto dto,
        PaymentMethod?    paymentMethod,
        Guid              actorId,
        CancellationToken ct = default)
    {
        // D-13 — Los cuatro guardados corren DENTRO de la transacción que abre
        // RegisterClientCommand, así que son atómicos entre sí. Y el intermedio
        // hace falta de verdad: las facturas retroactivas se releen después de
        // crearlas, y sin persistirlas la consulta no las encuentra. Es el único
        // sitio de Application con una consulta entre dos escrituras.
        var now        = DateTime.UtcNow;
        var invoiceIds = new List<Guid>();

        var instInvoice = new Invoice
        {
            ClientId = client.Id,
            Type     = InvoiceType.Instalacion,
            Status   = dto.PaidInstallation ? InvoiceStatus.Pagada : InvoiceStatus.Pendiente,
            Year     = now.Year,
            Month    = 0,
            Amount   = dto.InstallationCost,
            IssuedAt = now,
            DueDate  = now.AddDays(AppConstants.Time.InvoiceDueDays)
        };
        await _invoiceRepo.AddAsync(instInvoice);
        if (dto.PaidInstallation) invoiceIds.Add(instInvoice.Id);

        // El cliente tiene que estar persistido antes de generar las retroactivas:
        // cada factura lleva su FK.
        await _invoiceRepo.SaveChangesAsync();
        await _backfill.GenerateBackfillInvoicesAsync(client, plan.MonthlyPrice);
        await _invoiceRepo.SaveChangesAsync();

        if (dto.PaidFirstMonth)
        {
            var installDate       = client.InstallationDate;
            var firstMonthInvoice = await _invoiceRepo.GetAll()
                .FirstOrDefaultAsync(i =>
                    i.ClientId == client.Id &&
                    i.Year     == installDate.Year  &&
                    i.Month    == installDate.Month &&
                    i.Type     == InvoiceType.Mensualidad, ct);

            if (firstMonthInvoice is not null)
            {
                // E-04 — Antes ponía Pagada y NO tocaba AmountPaid, así que la
                // factura quedaba saldada con cero abonado. No producía deuda
                // fantasma —Outstanding filtra por estado— pero descuadraba
                // cualquier informe que sume lo abonado, y al anular ese pago la
                // reversión caía en la rama de "enlaces sin reparto conocido".
                firstMonthInvoice.RegistrarAbono(firstMonthInvoice.Amount);
                _invoiceRepo.Update(firstMonthInvoice);
                await _invoiceRepo.SaveChangesAsync();
                invoiceIds.Add(firstMonthInvoice.Id);
            }
        }

        if (invoiceIds.Count == 0 || paymentMethod is null) return;

        var paidInvoices = await _invoiceRepo.GetAll()
            .Where(i => invoiceIds.Contains(i.Id))
            .ToListAsync(ct);

        var payment = new Payment
        {
            ClientId              = client.Id,
            Amount                = paidInvoices.Sum(i => i.Amount),
            Method                = paymentMethod.Value,
            Bank                  = dto.Bank,
            PhysicalReceiptNumber = dto.PhysicalReceiptNumber,
            PaidAt                = DateTime.UtcNow,
            RegisteredByUserId    = actorId,
            FromWhatsApp          = false
        };
        await _paymentRepo.AddAsync(payment);

        // E-04 — El enlace lleva CUÁNTO se aplicó a cada factura. Sin ese dato,
        // anular este pago no puede saber qué revertir de cada una y acaba
        // marcando la reversión como inexacta, para revisión manual.
        var piEntries = paidInvoices
            .Select(inv => new PaymentInvoice
            {
                PaymentId     = payment.Id,
                InvoiceId     = inv.Id,
                AmountApplied = inv.Amount,
            })
            .ToList();
        await _piRepo.AddRangeAsync(piEntries);
        await _paymentRepo.SaveChangesAsync();
    }
}
