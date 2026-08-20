using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Notifications;

public class NotifSegment : Entity
{
    public string   Nombre      { get; set; } = string.Empty;
    public string?  Descripcion { get; set; }
    public string   ReglasJson  { get; set; } = "[]";
    public DateTime CreadoAt    { get; set; } = DateTime.UtcNow;
    public Guid?    CreadoPorId { get; set; }
    public DateTime? ActualizadoAt   { get; set; }
    public Guid?     ActualizadoPorId { get; set; }
}
