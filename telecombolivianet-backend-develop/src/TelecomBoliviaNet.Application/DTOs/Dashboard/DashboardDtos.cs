namespace TelecomBoliviaNet.Application.DTOs.Dashboard;

public record DashboardKpisDto(
    int     ClientesActivos,
    int     ClientesSuspendidos,
    int     ClientesNuevosMes,
    decimal CobradoEsteMes,
    decimal CobradoMesAnterior,
    int     ClientesConDeuda,
    decimal MontoDeudaTotal,
    int     TicketsAbiertos,
    int     TicketsCriticos,
    int     TicketsResueltosHoy,
    int     TicketsSlaVencidos,
    int     ComprobantesPendientes,
    int     MensajesWspHoy,
    decimal Arpu,
    int     ClientesCanceladosMes
);

public record TendenciaMesDto(string Mes, string MesCompleto, decimal Total, int Cantidad);
public record CollectionsTrendDto(List<TendenciaMesDto> Meses);

public record MetodoPagoDto(string Metodo, int Cantidad, decimal Monto);

public record TicketEstadoDashDto(string Estado, int Total, int Criticos);

public record TicketDashItemDto(
    Guid     Id,
    string   ClienteNombre,
    string   Asunto,
    string   Tipo,
    string   Prioridad,
    string   Estado,
    string   Tecnico,
    DateTime CreadoEn,
    DateTime? FechaLimite,
    bool     SlaVencido
);

public record TicketPorTipoDto(string Tipo, int Total);

public record ResolucionPromDto(string Prioridad, double HorasPromedio, int Cantidad);

public record WhatsAppActivityDto(
    string   Hora,
    string   ClienteNombre,
    string   Estado,
    decimal? Monto
);

public record DebtorItemDto(
    Guid    ClienteId,
    string  ClienteNombre,
    string  Zona,
    decimal MontoDeuda,
    int     DiasVencido,
    int     FacturasVencidas
);

public record RecentReceiptDto(
    Guid     Id,
    string   ClienteNombre,
    decimal  Monto,
    DateTime FechaPago,
    string   Estado,
    string   Metodo
);

public record ClientsByZoneDto(string Zona, int Total, int Activos, int ConDeuda);

public record ActivityHourDto(int Hora, int Pagos, int Tickets, int WhatsApp);

public record DashboardPreferencesDto(
    bool ShowKpis,
    bool ShowTendencia,
    bool ShowTickets,
    bool ShowWhatsApp,
    bool ShowDeudores,
    bool ShowZonas,
    bool ShowMetodosPago,
    bool ShowComprobantes
);


public record DashPagosDto(
    decimal TotalHoy,
    decimal TotalMes,
    int     CountHoy,
    int     CountMes,
    List<DashPagosPorMetodoDto>   PorMetodo,
    List<DashPaymentsByOperatorDto> PorOperador,
    List<TendenciaMesDto>         Tendencia6M
);

public record DashPagosPorMetodoDto(
    string  Metodo,
    int     Cantidad,
    decimal Monto,
    decimal PctMonto
);

public record DashPaymentsByOperatorDto(
    string  OperadorNombre,
    int     Cantidad,
    decimal Monto
);


public record DashTicketsMetricasDto(
    int     TotalAbiertos,
    int     TotalEnProceso,
    int     TotalResueltosMes,
    int     TotalVencidosSla,
    double  SlaCompliancePct,
    double  ResolucionPromedioHoras,
    List<DashTicketPorTipoMetricaDto> PorTipo,
    List<TicketDashItemDto>           VencidosSla
);

public record DashTicketPorTipoMetricaDto(
    string Tipo,
    int    Total,
    int    Abiertos,
    int    Resueltos,
    double PromedioHoras
);


public record DashNotifDto(
    int     EnviadasUlt24h,
    int     FallidasUlt24h,
    int     PendientesEnCola,
    int     OmitidosAntispam,
    double  TasaExitoUlt24h,
    List<DashNotifPorTipoDto> PorTipo
);

public record DashNotifPorTipoDto(
    string NotifTipo,
    int    Enviadas,
    int    Fallidas,
    int    Pendientes
);


public record DashChatbotDto(
    int    ConversacionesActivas,
    int    ConversacionesHoy,
    int    ConversacionesMes,
    double TasaResolucionBot,
    double TasaEscaladoHumano,
    List<DashChatbotIntencionDto> IntencionesFrecuentes,
    bool   IsAvailable = true
);

public record DashChatbotIntencionDto(
    string Intencion,
    int    Ocurrencias,
    double PctTotal
);


public record DashAutoActionsDto(
    int     SuspensionesHoy,
    int     ReactivacionesHoy,
    int     FacturasEmitidasHoy,
    int     RecordatoriosEnviadosHoy,
    int     FacturasVencidasMarcadasHoy,
    List<DashAutoActionItemDto> Recientes
);

public record DashAutoActionItemDto(
    string   Accion,
    string   Detalle,
    DateTime OcurridoAt,
    string   AreaModulo
);


public record DashDrillDownDto(
    string       Kpi,
    string       Periodo,
    object       Data
);


public record AgingBucketDto(
    string  Rango,
    int     FacturasCount,
    decimal MontoTotal,
    int     ClientesCount
);

public record AgingPortfolioDto(
    decimal              TotalCartera,
    int                  TotalFacturas,
    List<AgingBucketDto> Buckets
);


public record ClientUpcomingCutoffDto(
    Guid    ClienteId,
    string  ClienteNombre,
    string  Zona,
    decimal MontoDeuda,
    int     DiasParaCorte,
    string  EstadoFactura
);

public record UpcomingCutoffsDto(
    int                         Total,
    List<ClientUpcomingCutoffDto> Clientes
);


public record TechnicianWorkloadDto(
    string TecnicoNombre,
    int    TicketsActivos,
    int    TicketsCriticos,
    int    TicketsEnVisita,
    double PromedioHorasAbierto
);

public record TechniciansWorkloadDto(
    int                       TotalSinAsignar,
    List<TechnicianWorkloadDto>  Tecnicos
);
