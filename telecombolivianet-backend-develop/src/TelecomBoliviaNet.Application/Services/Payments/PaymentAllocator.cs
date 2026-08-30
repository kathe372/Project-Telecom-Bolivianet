using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Application.DTOs.Payments;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Services.Payments;

/// <summary>
/// Reparte un cobro entre las facturas que salda: valida cuáles son admisibles y
/// aplica el importe de la más antigua a la más nueva.
///
/// <para>Eran dos métodos privados de <c>PaymentCreditService</c> (F5). Salen
/// porque son un concepto propio —el reparto— que se puede leer y probar sin
/// montar la operación entera de registrar un cobro con crédito, y porque son lo
/// único que necesitaba el repositorio de enlaces pago-factura.</para>
///
/// <para>No guarda nada: marca las entidades como modificadas y añade los
/// enlaces. El <c>SaveChanges</c> ocurre una sola vez, en la transacción de quien
/// llama.</para>
/// </summary>
public class PaymentAllocator
{
    private readonly IGenericRepository<Invoice>        _invoiceRepo;
    private readonly IGenericRepository<PaymentInvoice> _piRepo;

    public PaymentAllocator(
        IGenericRepository<Invoice>        invoiceRepo,
        IGenericRepository<PaymentInvoice> piRepo)
    {
        _invoiceRepo = invoiceRepo;
        _piRepo      = piRepo;
    }

    /// <summary>
    /// Carga las facturas seleccionadas y comprueba que se pueda cobrar sobre
    /// ellas. Devuelve el motivo si alguna no procede.
    /// </summary>
    public async Task<(List<Invoice>? Invoices, string? Error)> LoadAndValidateAsync(
        RegisterPaymentDto dto)
    {
        if (dto.InvoiceIds.Count == 0)
            return (null, "Debe seleccionar al menos una factura.");

        var invoices = await _invoiceRepo.GetAll()
            .Where(i => dto.InvoiceIds.Contains(i.Id))
            .ToListAsync();

        if (invoices.Count != dto.InvoiceIds.Distinct().Count())
            return (null, "Una o más facturas no existen.");

        if (invoices.Any(i => i.ClientId != dto.ClientId))
            return (null, "Una o más facturas no pertenecen a este cliente.");

        if (invoices.Any(i => i.Status is InvoiceStatus.Pagada or InvoiceStatus.Anulada))
            return (null, "Una o más facturas seleccionadas ya están pagadas o anuladas.");

        return (invoices, null);
    }

    /// <summary>
    /// Aplica el importe a las facturas, de la que vence antes a la que vence
    /// después. Devuelve los números de las que quedaron tocadas, para el recibo.
    /// </summary>
    public async Task<List<string>> ApplyAsync(
        Payment payment, List<Invoice> invoices, decimal effectiveAmount)
    {
        var invoiceNumbers = new List<string>();
        var remaining      = effectiveAmount;

        foreach (var inv in invoices.OrderBy(i => i.DueDate))
        {
            if (remaining <= 0) break;

            // Una factura ya saldada o anulada no admite más cobro: enlazarla
            // generaría un PaymentInvoice espurio y falsearía la conciliación.
            if (inv.Status is InvoiceStatus.Anulada or InvoiceStatus.Pagada) continue;

            var applied = Math.Min(inv.Amount - inv.AmountPaid, remaining);
            if (applied <= 0) continue;

            // E-04 — El estado lo decide la entidad con la regla del dominio, y
            // la transición pasa por la tabla. Antes se elegía aquí a mano.
            inv.Abonar(applied);
            remaining -= applied;

            // Update marca, no confirma: con varias facturas por pago, confirmar
            // aquí haría un round-trip de SaveChanges POR FACTURA. El guardado
            // real ocurre una sola vez, en la transacción de quien llama.
            _invoiceRepo.Update(inv);

            // Se registra CUÁNTO se aplicó a esta factura: es lo que permite
            // revertir la anulación con exactitud cuando varios pagos la cubren.
            await _piRepo.AddAsync(new PaymentInvoice
            {
                PaymentId     = payment.Id,
                InvoiceId     = inv.Id,
                AmountApplied = applied,
            });

            if (inv.InvoiceNumber is not null) invoiceNumbers.Add(inv.InvoiceNumber);
        }

        return invoiceNumbers;
    }
}
