namespace TelecomBoliviaNet.Application.Interfaces;

public interface IInvoiceNumberService
{
    Task<string> NextInvoiceNumberAsync(bool isExtraordinary = false);
}
