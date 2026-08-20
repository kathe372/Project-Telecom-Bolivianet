using TelecomBoliviaNet.Application.DTOs.Common;
using TelecomBoliviaNet.Application.DTOs.Payments;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Interfaces;

public interface IPaymentQueryService
{
    Task<PagedResult<PaymentListItemDto>>          GetAllAsync(PaymentFilterDto filter);
    Task<PaymentDetailDto?>                        GetByIdAsync(Guid id);
    Task<CollectionReportDto>                      GetCollectionReportAsync(DateTime from, DateTime to);
    Task<Result<CollectionReportByOperatorDto>>    GetCollectionByOperatorAsync(
        DateTime from, DateTime to, Guid? operatorId);
}
