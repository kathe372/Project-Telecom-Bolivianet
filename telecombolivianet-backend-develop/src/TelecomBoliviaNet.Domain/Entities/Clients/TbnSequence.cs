namespace TelecomBoliviaNet.Domain.Entities.Clients;

public class TbnSequence
{
    public int Id           { get; set; } = 1;
    public int LastValue    { get; set; } = 0;
    public string Prefix    { get; set; } = "TBN";
}

public class InvoiceSequence
{
    public int Id        { get; set; } = 1;
    public int Year      { get; set; }
    public int LastValue { get; set; } = 0;
}

public class ReceiptSequence
{
    public int Id        { get; set; } = 1;
    public int Year      { get; set; }
    public int LastValue { get; set; } = 0;
}
