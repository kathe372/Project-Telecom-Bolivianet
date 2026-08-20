using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Notifications;

public enum TemplateCategory
{
    Cobro,
    Bienvenida,
    Tecnico,
    Ticket,
    General
}

public enum HsmStatus
{
    Aprobada,
    Pendiente,
    Rechazada
}

public class NotifTemplate : Entity
{
    public NotifType          Tipo               { get; set; }
    public string             Texto              { get; set; } = string.Empty;
    public bool               Activa             { get; set; } = true;
    public TemplateCategory Categoria          { get; set; } = TemplateCategory.General;
    public HsmStatus          HsmStatus          { get; set; } = HsmStatus.Pendiente;
    public DateTime           CreadoAt           { get; set; } = DateTime.UtcNow;
    public Guid?              CreadoPorId        { get; set; }

    public string?            MetaTemplateName   { get; set; }
    public string?            MetaLanguageCode   { get; set; } = "es";
    public string?            MetaParamOrder     { get; set; }
}
