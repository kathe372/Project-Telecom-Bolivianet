using TelecomBoliviaNet.Domain.Entities.Notifications;

namespace TelecomBoliviaNet.Application.DTOs.Notifications;


public record NotifConfigDto(
    NotifType Tipo,
    bool      Activo,
    int       DelaySegundos,
    string    HoraInicio,
    string    HoraFin,
    bool      Inmediato,
    int?      DiasAntes,
    Guid?     PlantillaId
);

public record NotifConfigListDto(
    List<NotifConfigDto> Configs,
    string               HoraServidorLocal
);

public record UpdateNotifConfigDto(
    NotifType Tipo,
    bool      Activo,
    int       DelaySegundos,
    string    HoraInicio,
    string    HoraFin,
    bool      Inmediato,
    int?      DiasAntes,
    Guid?     PlantillaId
);

public record UpdateNotifConfigsDto(List<UpdateNotifConfigDto> Configs);


public record NotifTemplateDto(
    Guid               Id,
    NotifType          Tipo,
    string             Texto,
    bool               Activa,
    TemplateCategory Categoria,
    HsmStatus          HsmStatus,
    DateTime           CreadoAt,
    string?            MetaTemplateName,
    string?            MetaLanguageCode,
    string?            MetaParamOrder
);

public record UpdateNotifTemplateDto(
    string             Texto,
    TemplateCategory Categoria        = TemplateCategory.General,
    HsmStatus          HsmStatus        = HsmStatus.Pendiente,
    string?            MetaTemplateName = null,
    string?            MetaLanguageCode = "es",
    string?            MetaParamOrder   = null
);

public record UpdateHsmStatusDto(HsmStatus HsmStatus);


public record NotifLogItemDto(
    Guid      Id,
    Guid      OutboxId,
    NotifType Tipo,
    string    TipoLabel,
    string    Estado,
    string    PhoneNumber,
    string    Mensaje,
    int       IntentoNum,
    string?   ErrorDetalle,
    DateTime  RegistradoAt,
    DateTime? EnviarDesde
);

public record NotifLogPageDto(
    List<NotifLogItemDto> Items,
    int                   Total,
    int                   Page,
    int                   PageSize
);


public record CancelBulkResultDto(int CancelledCount);


public record SegmentCondition(
    string Campo,
    string Operador,
    string Valor
);

public record SegmentConditionGroup(List<SegmentCondition> Condiciones);

public record NotifSegmentDto(
    Guid                        Id,
    string                      Nombre,
    string?                     Descripcion,
    List<SegmentConditionGroup> Reglas,
    DateTime                    CreadoAt,
    int?                        ClientesEstimados
);

public record CreateOrUpdateSegmentDto(
    string                      Nombre,
    string?                     Descripcion,
    List<SegmentConditionGroup> Reglas
);

public record SegmentPreviewDto(int ClientesCoinciden);


public record BulkSendDto(
    NotifType Tipo,
    Guid?     SegmentId
);

public record BulkSendResultDto(int Enviados, int OmitidosAntispam, int SinTelefono);


public record WhatsappDeliveryStatusDto(
    string WaMessageId,
    string Status,
    long   Timestamp
);


public record TemplatePreviewDto(
    string TextoRenderizado,
    List<string> VariablesNoEncontradas
);
