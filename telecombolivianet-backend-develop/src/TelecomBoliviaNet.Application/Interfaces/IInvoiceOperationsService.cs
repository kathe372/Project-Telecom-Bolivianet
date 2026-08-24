using TelecomBoliviaNet.Application.DTOs.Invoices;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Interfaces;

/// <summary>
/// Operaciones sobre facturas ya emitidas: cargos extraordinarios, cambios de
/// estado, marcado de envío y aplicación de saldo a favor.
///
/// Distinto de <see cref="IBillingService"/>, que genera la facturación del mes.
/// </summary>
public interface IInvoiceOperationsService
{
    Task<Result<InvoiceListItemDto>> CreateExtraordinaryAsync(
        CreateExtraordinaryInvoiceDto dto, Guid actorId, string actorName, string ip);

    Task<Result> TransicionarEstadoAsync(
        Guid invoiceId, InvoiceStatus nuevoEstado, Guid actorId, string actorName, string ip);

    Task<int> MarkInvoicesSentAsync(
        int year, int month, Guid actorId, string actorName, string ip);

    Task<Result> ApplyCreditAsync(Guid invoiceId, Guid actorId, string actorName, string ip);
}
