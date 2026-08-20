namespace TelecomBoliviaNet.Application.Interfaces;

public interface IFileStorage
{
    Task<string> SaveAsync(Stream stream, string fileName, string folder = "receipts");

    Task<(byte[] Bytes, string ContentType)> ReadAsync(string relativeUrl);

    Task DeleteAsync(string relativeUrl);
}
