using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;
using TelecomBoliviaNet.Domain.Services;

namespace TelecomBoliviaNet.Application.Services.Invoices;

/// <summary>
/// Descontar de una factura el saldo a favor que tiene el cliente.
///
/// <para>Extraído de <c>InvoiceOperationsService</c> (F5). Es la única operación
/// de facturación que toca el libro mayor de crédito.</para>
/// </summary>
public class InvoiceCreditService : IInvoiceCreditService
{
    private readonly IGenericRepository<Invoice> _invoiceRepo;
    private readonly IGenericRepository<Client>  _clientRepo;
    private readonly ICreditLedger               _creditLedger;
    private readonly AuditService                _audit;

    public InvoiceCreditService(
        IGenericRepository<Invoice> invoiceRepo,
        IGenericRepository<Client>  clientRepo,
        ICreditLedger               creditLedger,
        AuditService                audit)
    {
        _invoiceRepo  = invoiceRepo;
        _clientRepo   = clientRepo;
        _creditLedger = creditLedger;
        _audit        = audit;
    }

    public async Task<Result> ApplyCreditAsync(
        Guid invoiceId, Guid actorId, string actorName, string ip)
    {
        var invoice = await _invoiceRepo.GetAll()
            .Include(i => i.Client)
            .FirstOrDefaultAsync(i => i.Id == invoiceId);

        if (invoice is null) return Result.Failure("Factura no encontrada.");
        if (invoice.Status == InvoiceStatus.Pagada) return Result.Failure("La factura ya está pagada.");
        if (invoice.Status == InvoiceStatus.Anulada) return Result.Failure("La factura está anulada.");
        if (invoice.Client is null) return Result.Failure("Cliente no encontrado.");

        var saldoPendiente = invoice.Amount - invoice.AmountPaid;
        if (saldoPendiente <= 0) return Result.Failure("La factura no tiene saldo pendiente.");

        var credito = invoice.Client.CreditBalance;
        if (credito <= 0) return Result.Failure("El cliente no tiene crédito a favor.");

        var (aplicar, _)       = InvoiceDomainService.ApplyCredit(credito, saldoPendiente);
        invoice.CreditApplied += aplicar;
        // E-04 — Ya usaba la regla correcta; ahora además pasa por la tabla de
        // transiciones, igual que el resto.
        invoice.Abonar(aplicar);

        // El saldo lo ajusta el libro mayor, que además deja el asiento. Antes se
        // asignaba `CreditBalance` a mano y el consumo no quedaba registrado.
        await _creditLedger.RecordAsync(
            invoice.Client, -aplicar, CreditMovementType.AplicadoAFactura,
            invoiceId: invoice.Id, createdByUserId: actorId,
            notes: $"Crédito aplicado a la factura {invoice.InvoiceNumber ?? invoice.Id.ToString()}");

        // D-13 — La factura y el saldo del cliente se confirman JUNTOS.
        //
        // Se guardaba primero la factura y después el cliente: si el segundo
        // guardado fallaba, la factura quedaba saldada y el crédito del cliente
        // SIN descontar. Es decir, dinero regalado, y en silencio.
        //
        // Comparten DbContext: un solo guardado los persiste a los dos o a
        // ninguno.
        _invoiceRepo.Update(invoice);
        _clientRepo.Update(invoice.Client);
        await _invoiceRepo.SaveChangesAsync();
        await _audit.LogAsync("Facturación", "CREDIT_APPLIED_TO_INVOICE",
            $"Crédito aplicado: factura {invoice.InvoiceNumber} Bs.{aplicar:F2}",
            userId: actorId, userName: actorName, ip: ip,
            newData: System.Text.Json.JsonSerializer.Serialize(new {
                InvoiceId = invoiceId, Aplicado = aplicar,
                NuevoSaldoCliente = invoice.Client.CreditBalance }));

        return Result.Success();
    }
}
