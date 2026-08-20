namespace TelecomBoliviaNet.Application.DTOs.Bot;


public record BotConfigDto(
    BotMenuDto      Menu,
    BotScheduleDto   Horario,
    BotMensajesDto  Mensajes,
    List<string>?   PalabrasClave = null
);

public record BotMenuDto(
    string               TituloMenu,
    List<BotMenuItemDto> Opciones,
    string               TituloBoton,
    string               TituloSeccion
);

public record BotMenuItemDto(
    string  Numero,
    string  Etiqueta,
    string  Intent,
    bool    Activa,
    string? Descripcion,
    bool    SoloCliente
);

public record BotScheduleDto(
    string  HoraInicio,
    string  HoraFin,
    bool[]  DiasActivos,
    string  MensajeFueraHorario
);

public record BotMensajesDto(
    string  Bienvenida,
    string  BienvenidaProspecto,
    string  NoEntendido,
    string  EscaladoAgente
);

public record UpdateBotConfigDto(BotConfigDto Config);


public record ConversationListItemDto(
    string   Id,
    string   PhoneNumber,
    string?  ClientId,
    string?  ClientName,
    bool     IsEscalated,
    string?  AgentName,
    string?  EscaladoAt,
    string   UpdatedAt,
    string   CreatedAt,
    string?  UltimoMensaje,
    int      TotalMessages
);

public record ConversationDetailDto(
    string   Id,
    string   PhoneNumber,
    string?  ClientId,
    string?  ClientName,
    bool     IsEscalated,
    string?  AgentName,
    List<ConversationMessageDto> Messages,
    string?  UpdatedAt = null,
    string?  CreatedAt = null
);

public record ConversationMessageDto(
    string   Id,
    string   Role,
    string?  Source,
    string   Content,
    string   CreatedAt,
    string?  MediaUrl,
    string?  MediaType
);

public record ConversationStatsDto(
    int TotalConversaciones,
    int Escaladas,
    int HoyConversaciones,
    int HoyMensajes
);


public record ClientConversationHistoryDto(
    string   PhoneNumber,
    List<ConversationListItemDto> Conversaciones
);


public record SendMessageRequestDto(string Texto);
