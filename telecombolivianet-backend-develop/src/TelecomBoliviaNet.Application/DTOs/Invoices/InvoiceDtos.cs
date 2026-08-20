namespace TelecomBoliviaNet.Application.DTOs.Invoices;


public record InvoiceDetailDto(
    Guid      Id,
    Guid      ClientId,
    string    TbnCode,
    string    ClientName,
    string    PlanName,
    string    Type,
    string    Status,
    int       Year,
    int       Month,
    decimal   Amount,
    DateTime  IssuedAt,
    DateTime  DueDate,
    string?   Notes,
    DateTime? UpdatedAt,
    string?   PaymentMethod,
    string?   PaymentBank,
    DateTime? PaidAt,
    string?   PaidByName
);


public record InvoiceMonthStatsDto(
    int     Year,
    int     Month,
    decimal TotalBilled,
    decimal TotalCollected,
    decimal TotalPending,
    int     CountBilled,
    int     CountCollected,
    int     CountPending,
    int     CountOverdue,
    decimal CollectionRate
);


public record InvoiceRangeStatsDto(
    DateTime DateFrom,
    DateTime DateTo,
    decimal  TotalBilled,
    decimal  TotalCollected,
    decimal  TotalPending,
    int      CountBilled,
    int      CountCollected,
    int      CountPending,
    int      CountOverdue,
    decimal  CollectionRate
);


public record InvoiceFilterDto(
    int?      Year       = null,
    int?      Month      = null,
    string?   Status     = null,
    string?   Search     = null,
    DateTime? DateFrom   = null,
    DateTime? DateTo     = null,
    int       PageNumber = 1,
    int       PageSize   = 25,
    /// <summary>
    /// Tipo de factura: nombre de <c>InvoiceType</c> o "all"/null para todas.
    ///
    /// Antes las consultas del módulo forzaban <c>Mensualidad</c>, así que las facturas
    /// extraordinarias (reconexión, equipo, visita técnica) y las de instalación no aparecían
    /// en la pantalla de Facturación NI en sus totales de facturado/cobrado/pendiente: dinero
    /// emitido que el módulo de facturación simplemente no mostraba.
    /// </summary>
    string?   Type       = null
);


public record BillingJobResultDto(
    int    Generated,
    int    Skipped,
    int    ExcludedBaja,
    int    Errors,
    string Period
);

public record BillingPreviewDto(
    int     ToGenerate,
    int     AlreadyBilled,
    int     ExcludedBaja,
    int     WithErrors,
    decimal EstimatedTotal,
    string  Period
);


public record ManualBillingDto(int Year, int Month);


public record InvoiceListItemDto(
    Guid     Id,
    string   InvoiceNumber,
    Guid     ClientId,
    string   TbnCode,
    string   ClientName,
    string   Type,
    string   Status,
    int      Year,
    int      Month,
    decimal  Amount,
    decimal  AmountPaid,
    decimal  CreditApplied,
    DateTime IssuedAt,
    DateTime DueDate,
    DateTime? UpdatedAt,
    string?  Notes,
    bool     IsExtraordinary,
    string?  ExtraordinaryReason
);

public record InvoiceLegacyListItemDto(
    Guid      Id,
    string    TbnCode,
    string    ClientName,
    string    PlanName,
    decimal   Amount,
    string    Type,
    string    Status,
    int       Year,
    int       Month,
    DateTime  IssuedAt,
    DateTime  DueDate,
    string?   Notes,
    Guid?     PaymentId,
    string?   InvoiceNumber,
    string    Zone,
    decimal   AmountPaid,
    DateTime? PaidAt,
    int       DaysOverdue
);


public record VoidInvoiceDto(string Justification);


public record AnnualReportRowDto(
    Guid    ClientId,
    string  TbnCode,
    string  ClientName,
    string  Zone,
    string  PlanName,
    IEnumerable<AnnualReportCellDto> Cells
);

public record AnnualReportCellDto(
    int       Month,
    string    Label,
    string    Status,
    decimal   Amount,
    string?   PaymentMethod,
    DateTime? PaidAt,
    Guid?     InvoiceId
);

public record AnnualReportFilterDto(
    int     Year,
    string? Zone       = null,
    Guid?   PlanId     = null,
    string? DebtFilter = null,
    string? SortBy     = null,
    string? Search     = null
);


/// <summary>
/// Filtros de una exportación de facturación. Son los mismos que la pantalla de
/// Facturación: antes el export solo aceptaba año y mes, así que el usuario
/// filtraba, exportaba y recibía un archivo distinto de lo que estaba viendo.
/// </summary>
public record InvoiceExportQueryDto(
    int     Year,
    int     Month,
    string? Type   = null,
    string? Status = null,
    string? Search = null
);


public record AnnualReportExportDto(
    int                               Year,
    IEnumerable<AnnualReportExportRowDto> Rows
);

public record AnnualReportExportRowDto(
    string TbnCode,
    string FullName,
    string Zone,
    string PlanName,
    IList<AnnualReportExportCellDto> Cells
);

public record AnnualReportExportCellDto(
    string  Status,
    decimal Amount,
    string? PaidDate,
    string? PaymentMethod
);


public record CreateExtraordinaryInvoiceDto(
    Guid     ClientId,
    decimal  Amount,
    string   Motivo,
    DateTime DueDate,
    string?  Notes
);


public record TransicionEstadoDto(string NuevoEstado);

public record MarkSentDto(int Year, int Month);

public record MarkSentResultDto(int Count, string Period);


public record ApplyCreditResultDto(decimal Aplicado, decimal NuevoSaldoCliente);


public record InvoicePendienteDto(
    Guid     Id,
    string   InvoiceNumber,
    string   Status,
    int      Year,
    int      Month,
    decimal  Amount,
    DateTime DueDate,
    string?  Notes);


public record DebtorDto(
    Guid     ClientId,
    string   TbnCode,
    string   FullName,
    string   Zone,
    string   PlanName,
    int      MesesPendientes,
    decimal  TotalDeuda,
    DateTime UltimoVencimiento,
    IEnumerable<InvoicePendienteDto> Facturas);


public record InvoiceStatsM3Dto(
    int     TotalEmitidas,
    int     TotalEnviadas,
    int     TotalPendientes,
    int     TotalVencidas,
    int     TotalPagadas,
    int     TotalAnuladas,
    int     TotalParciales,
    decimal TotalMonto,
    decimal TotalRecaudado,
    decimal TotalCreditoAplicado
);
