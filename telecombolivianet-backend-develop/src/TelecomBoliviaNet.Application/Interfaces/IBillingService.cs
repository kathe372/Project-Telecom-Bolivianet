using TelecomBoliviaNet.Application.DTOs.Invoices;

namespace TelecomBoliviaNet.Application.Interfaces;

/// <summary>
/// El ciclo de facturación mensual: qué se emitiría y emitirlo.
///
/// <para>Las retroactivas de un alta están en <see cref="IInvoiceBackfillService"/>
/// y los cambios de estado de facturas ya emitidas en
/// <see cref="IInvoiceStatusService"/>.</para>
/// </summary>
public interface IBillingService
{
    Task<BillingPreviewDto> GetBillingPreviewAsync(int year, int month);

    Task<BillingJobResultDto> GenerateMonthlyInvoicesAsync(
        int year, int month, Guid? actorId = null, string actorName = "Sistema");
}
