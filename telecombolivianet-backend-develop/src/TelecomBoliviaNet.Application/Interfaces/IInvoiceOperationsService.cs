using TelecomBoliviaNet.Application.DTOs.Invoices;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Interfaces;

/// <summary>
/// Mover facturas ya emitidas de un estado a otro, por decisión del operador.
///
/// <para>Distinto de <see cref="IInvoiceStatusService"/>, que marca vencidas en
/// lote y anula; y de <see cref="IBillingService"/>, que genera la facturación
/// del mes.</para>
/// </summary>
public interface IInvoiceOperationsService
{
    Task<Result> TransicionarEstadoAsync(
        Guid invoiceId, InvoiceStatus nuevoEstado, Guid actorId, string actorName, string ip);

    /// <summary>
    /// Marca como enviadas todas las facturas emitidas de un mes. Devuelve
    /// cuántas cambiaron.
    /// </summary>
    Task<int> MarkInvoicesSentAsync(int year, int month, Guid actorId, string actorName, string ip);
}

/// <summary>
/// Cargos que no vienen del ciclo mensual: reconexión, material, traslado.
/// </summary>
public interface IExtraordinaryInvoiceService
{
    Task<Result<InvoiceListItemDto>> CreateExtraordinaryAsync(
        CreateExtraordinaryInvoiceDto dto, Guid actorId, string actorName, string ip);
}

/// <summary>Descontar de una factura el saldo a favor del cliente.</summary>
public interface IInvoiceCreditService
{
    Task<Result> ApplyCreditAsync(Guid invoiceId, Guid actorId, string actorName, string ip);
}
