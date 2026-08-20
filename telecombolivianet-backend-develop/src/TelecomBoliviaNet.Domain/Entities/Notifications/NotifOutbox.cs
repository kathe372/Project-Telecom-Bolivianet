using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Notifications;

public enum NotifEstadoFinal
{
    ENVIADO,
    FALLIDO,
    CANCELADO,
    OMITIDO
}

public class NotifOutbox : Entity
{
    public NotifType           Tipo            { get; set; }
    public Guid                ClienteId       { get; set; }
    public Client?             Cliente         { get; set; }
    public string              PhoneNumber     { get; set; } = string.Empty;
    public Guid?               PlantillaId     { get; set; }
    public bool                Publicado       { get; set; } = false;
    public int                 Intentos        { get; set; } = 0;
    public DateTime            EnviarDesde     { get; set; }
    public DateTime?           ProximoIntento  { get; set; }
    public NotifEstadoFinal?   EstadoFinal     { get; set; }
    public DateTime            CreadoAt        { get; set; } = DateTime.UtcNow;
    public DateTime?           ProcesadoAt     { get; set; }
    public string              ContextoJson    { get; set; } = "{}";
    public Guid?               ReferenciaId    { get; set; }
}
