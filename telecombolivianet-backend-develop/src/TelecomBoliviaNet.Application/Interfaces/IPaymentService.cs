using TelecomBoliviaNet.Application.DTOs.Payments;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Interfaces;

/// <summary>
/// Anular un cobro. Las lecturas están en <see cref="IPaymentQueryService"/>,
/// los informes en <see cref="IPaymentReportService"/> y los recordatorios en
/// <see cref="IOverdueReminderService"/>.
///
/// <para>Adjuntar el comprobante vive en <c>IReceiptImageService</c>: tener aquí
/// una segunda copia hizo que el controlador usara la versión con el bug (pasaba
/// el contentType donde va la carpeta).</para>
/// </summary>
public interface IPaymentService
{
    Task<Result<VoidPaymentResultDto>> VoidPaymentAsync(
        Guid paymentId, string justification, Guid actorId, string actorName, string ip);
}
