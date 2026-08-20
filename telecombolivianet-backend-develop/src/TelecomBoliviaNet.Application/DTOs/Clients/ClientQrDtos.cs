namespace TelecomBoliviaNet.Application.DTOs.Clients;

public record ClientQrDto(
    Guid      Id,
    string    ImageUrl,
    DateTime? ExpiresAt,
    bool      IsActive,
    bool      AlertSent,
    DateTime  UploadedAt,
    string    UploadedByName,
    int?      DaysUntilExpiry
);

public class UpdateClientQrDto
{
    public int? ExpiresInDays { get; set; }
}
