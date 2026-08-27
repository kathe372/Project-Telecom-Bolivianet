using TelecomBoliviaNet.Application.DTOs.Common;
using TelecomBoliviaNet.Application.DTOs.Payments;

namespace TelecomBoliviaNet.Application.Interfaces;

/// <summary>
/// Lecturas del módulo de Pagos: listado, ficha y detección de duplicados.
/// Ninguna modifica nada.
/// </summary>
public interface IPaymentQueryService
{
    Task<PagedResult<PaymentListItemDto>> GetAllAsync(PaymentFilterDto filter);

    Task<PaymentDetailDto?> GetByIdAsync(Guid id);

    /// <summary>
    /// ¿Ya se registró un cobro igual a este cliente en los últimos días? Evita
    /// que el mismo pago entre dos veces cuando la pantalla se envía repetida.
    /// </summary>
    Task<DuplicateCheckResultDto> CheckDuplicateAsync(Guid clientId, decimal amount, DateTime paidAt);

    /// <summary>Recibo emitido para un pago, si lo tiene.</summary>
    Task<Domain.Entities.Payments.PaymentReceipt?> GetReceiptByPaymentAsync(Guid paymentId);
}

/// <summary>Los dos informes de recaudación.</summary>
public interface IPaymentReportService
{
    Task<CollectionReportDto> GetCollectionReportAsync(DateTime from, DateTime to);

    Task<Domain.Primitives.Result<CollectionReportByOperatorDto>> GetCollectionByOperatorAsync(
        DateTime from, DateTime to, Guid? operatorId);
}

/// <summary>Recordatorio masivo de facturas vencidas.</summary>
public interface IOverdueReminderService
{
    Task<ReminderJobResultDto> SendOverdueRemindersAsync(
        Guid? actorId = null, string actorName = "Sistema");
}
