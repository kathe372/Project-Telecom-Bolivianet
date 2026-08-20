using TelecomBoliviaNet.Application.Interfaces;

namespace TelecomBoliviaNet.Application.Services.Invoices;

public class InvoiceNumberService : IInvoiceNumberService
{
    private readonly ISequenceGenerator _seq;

    public InvoiceNumberService(ISequenceGenerator seq) => _seq = seq;

    public Task<string> NextInvoiceNumberAsync(bool isExtraordinary = false)
        => _seq.NextInvoiceNumberAsync(isExtraordinary);
}
