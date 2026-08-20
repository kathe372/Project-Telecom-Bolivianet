namespace TelecomBoliviaNet.Application.Interfaces;

public interface ISequenceGenerator
{
    Task<string> NextInvoiceNumberAsync(bool isExtraordinary = false);

    Task<string> NextTicketNumberAsync();

    Task<string> NextReceiptNumberAsync();
}
