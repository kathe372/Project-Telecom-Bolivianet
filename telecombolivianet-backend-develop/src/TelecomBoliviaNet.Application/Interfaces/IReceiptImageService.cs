using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Interfaces;

public interface IReceiptImageService
{
    Task<Result<string>> AttachReceiptImageAsync(
        Guid paymentId, Stream stream, string fileName, string contentType,
        Guid actorId, string actorName, string ip);
}
