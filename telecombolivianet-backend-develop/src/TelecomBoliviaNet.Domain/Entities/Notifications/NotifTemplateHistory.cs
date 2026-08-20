using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Notifications;

public class NotifTemplateHistory : Entity
{
    public Guid      PlantillaId   { get; set; }
    public NotifType Tipo          { get; set; }
    public string    Texto         { get; set; } = string.Empty;
    public DateTime  ArchivadoAt   { get; set; } = DateTime.UtcNow;
    public Guid?     ArchivadoPorId { get; set; }
}
