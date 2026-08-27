using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Interfaces;

/// <summary>
/// Facturas retroactivas de un cliente dado de alta con fecha de instalación
/// anterior a hoy.
/// </summary>
public interface IInvoiceBackfillService
{
    Task GenerateBackfillInvoicesAsync(Client client, decimal monthlyPrice);
}

/// <summary>
/// Cambios de estado sobre facturas ya emitidas. Distinto de
/// <see cref="IBillingService"/>, que genera la facturación del mes.
/// </summary>
public interface IInvoiceStatusService
{
    /// <summary>
    /// Marca vencidas las facturas cuyo plazo pasó y avisa al cliente. Devuelve
    /// cuántas se marcaron.
    /// </summary>
    Task<int> MarkOverdueInvoicesAsync(Guid? actorId = null, string actorName = "Sistema");

    Task<Result> VoidInvoiceAsync(
        Guid invoiceId, string justification, Guid actorId, string actorName, string ip);
}
