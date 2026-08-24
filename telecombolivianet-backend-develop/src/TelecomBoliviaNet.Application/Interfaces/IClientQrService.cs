using Microsoft.AspNetCore.Http;
using TelecomBoliviaNet.Application.DTOs.Clients;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Interfaces;

/// <summary>
/// QR de pago por cliente: alta, consulta del vigente, historial y el aviso de
/// caducidad que consume <c>QrExpiryAlertJob</c>.
/// </summary>
public interface IClientQrService
{
    Task<Result<ClientQrDto>> UploadQrAsync(
        Guid clientId, IFormFile file, UpdateClientQrDto meta,
        Guid actorId, string actorName, string ip);

    Task<(ClientQrDto? Dto, byte[]? ImageBytes, string? ContentType)> GetActiveQrAsync(Guid clientId);

    Task<List<ClientQrDto>> GetHistorialAsync(Guid clientId);

    /// <summary>Desactiva los QR cuya vigencia ya pasó. Lo llama el job diario.</summary>
    Task DeactivateExpiredQrsAsync();

    /// <summary>QR próximos a caducar, para avisar al cliente antes de que deje de servir.</summary>
    Task<List<(Guid ClientId, string ClientName, string TbnCode, DateTime ExpiresAt)>>
        GetQrsExpiringSoonAsync();

    /// <summary>
    /// Marca que ya se avisó a este cliente. Es la parte PERSISTENTE de la
    /// idempotencia del job: sin ella, dos corridas avisarían dos veces.
    /// </summary>
    Task MarkAlertSentAsync(Guid clientId);
}
