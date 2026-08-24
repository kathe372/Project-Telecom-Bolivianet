using MediatR;
using TelecomBoliviaNet.Application.Clients.Helpers;
using TelecomBoliviaNet.Application.DTOs.Clients;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Clients.Queries;

public record GetClientInvoicesQuery(Guid ClientId, int Year) : IRequest<InvoiceGridDto>;

public class GetClientInvoicesHandler : IRequestHandler<GetClientInvoicesQuery, InvoiceGridDto>
{
    private readonly IInvoiceRepository _invoiceRepo;
    private readonly IPaymentRepository _paymentRepo;

    public GetClientInvoicesHandler(
        IInvoiceRepository invoiceRepo,
        IPaymentRepository paymentRepo)
    {
        _invoiceRepo = invoiceRepo;
        _paymentRepo = paymentRepo;
    }

    public async Task<InvoiceGridDto> Handle(GetClientInvoicesQuery q, CancellationToken ct)
    {
        var invoices = await _invoiceRepo.GetForClientYearAsync(q.ClientId, q.Year, ct);
        var payments = await _paymentRepo.GetHistoryForClientAsync(q.ClientId, ct);

        var debt    = ClientProjectionHelpers.CalcDebt(
            invoices.Where(i => i.Year == q.Year || i.Type == InvoiceType.Instalacion));
        var pending = ClientProjectionHelpers.CalcPendingMonths(invoices);
        var lastPay = payments.Select(p => (DateTime?)p.PaidAt).FirstOrDefault();

        return new InvoiceGridDto(
            invoices.Select(ClientProjectionHelpers.MapInvoice),
            payments.Select(ClientProjectionHelpers.MapPaymentDto),
            debt, pending, lastPay);
    }
}
