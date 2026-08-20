using TelecomBoliviaNet.Application.DTOs.Plans;

namespace TelecomBoliviaNet.Application.DTOs.Clients;


public record RegisterClientDto(
    string  FullName,
    string  IdentityCard,
    string  PhoneMain,
    string? PhoneSecondary,

    string  Zone,
    string? Street,
    string? LocationRef,
    decimal? GpsLatitude,
    decimal? GpsLongitude,

    string   WinboxNumber,
    DateTime InstallationDate,
    Guid     InstalledByUserId,
    Guid     PlanId,
    bool     HasTvCable,
    string?  OnuSerialNumber,

    decimal InstallationCost,
    bool    PaidInstallation,
    bool    PaidFirstMonth,
    string? PaymentMethod,
    string? Bank,
    string? PhysicalReceiptNumber,
    /// <summary>Instalación de origen (conversión prospecto→cliente, F4).</summary>
    Guid?   InstallationId = null
);


public record UpdateClientDto(
    string  FullName,
    string  IdentityCard,
    string  PhoneMain,
    string? PhoneSecondary,
    string  Zone,
    string? Street,
    string? LocationRef,
    decimal? GpsLatitude,
    decimal? GpsLongitude,
    string  WinboxNumber,
    Guid    PlanId,
    bool    HasTvCable,
    string? OnuSerialNumber,
    uint    RowVersion = 0
);


public record ClientListItemDto(
    Guid    Id,
    string  TbnCode,
    string  FullName,
    string  Zone,
    string  PhoneMain,
    string  PlanName,
    bool    HasTvCable,
    string  Status,
    decimal TotalDebt,
    int     PendingMonths,
    DateTime? SuspendedAt = null
);

public record ClientDetailDto(
    Guid     Id,
    string   TbnCode,
    string   FullName,
    string   IdentityCard,
    string   PhoneMain,
    string?  PhoneSecondary,
    string   Zone,
    string?  Street,
    string?  LocationRef,
    decimal? GpsLatitude,
    decimal? GpsLongitude,
    string   WinboxNumber,
    DateTime InstallationDate,
    Guid     InstalledByUserId,
    string   InstalledByName,
    PlanDto  Plan,
    bool     HasTvCable,
    string?  OnuSerialNumber,
    string   Status,
    DateTime? SuspendedAt,
    DateTime? CancelledAt,
    decimal  TotalDebt,
    int      PendingMonths,
    DateTime? LastPaymentDate,
    bool     InstallationPaid,
    DateTime CreatedAt,
    string?  Email,
    decimal  CreditBalance,
    int      AttachmentCount,
    uint     RowVersion,
    Guid?    CajaNapId = null,
    string?  CajaNap   = null
);


public record InvoiceDto(
    Guid     Id,
    string   Type,
    string   Status,
    int      Year,
    int      Month,
    decimal  Amount,
    DateTime IssuedAt,
    DateTime DueDate,
    string?  Notes,
    // Sin AmountPaid el consumidor no puede calcular el saldo real de una
    // factura ParcialmentePagada y termina cobrando el importe completo.
    decimal  AmountPaid = 0m
);

public record InvoiceGridDto(
    IEnumerable<InvoiceDto> Invoices,
    IEnumerable<PaymentDto> Payments,
    decimal TotalDebt,
    int PendingMonths,
    DateTime? LastPaymentDate
);


public record RegisterPaymentDto(
    Guid       ClientId,
    decimal    Amount,
    string     Method,
    string?    Bank,
    DateTime   PaidAt,
    string?    PhysicalReceiptNumber,
    List<Guid> InvoiceIds,
    bool?      ConfirmedDuplicate = null,
    string?    BankReference      = null
);

public record PaymentDto(
    Guid     Id,
    decimal  Amount,
    string   Method,
    string?  Bank,
    string?  BankReference,
    string?  PhysicalReceiptNumber,
    DateTime PaidAt,
    DateTime RegisteredAt,
    string   RegisteredByName,
    bool     FromWhatsApp,
    string?  ReceiptImageUrl,
    bool     CanVoid,
    bool     IsVoided,
    IEnumerable<string> CoveredMonths
);


public record ClientFilterDto(
    string?  Search      = null,
    string?  Status      = null,
    Guid?    PlanId      = null,
    string?  DebtFilter  = null,
    string?  SortBy      = null,
    int      PageNumber  = 1,
    int      PageSize    = 20
);


public record ClientAttachmentDto(
    Guid     Id,
    string   FileName,
    string   TipoDoc,
    string   ContentType,
    long     FileSizeBytes,
    string?  Descripcion,
    string   StoragePath,
    string   SubidoPorNombre,
    DateTime SubidoAt
);

public record UploadAttachmentDto(
    string   TipoDoc,
    string?  Descripcion
);


public record ClientActivityItemDto(
    Guid      Id,
    string    Tipo,
    string    Descripcion,
    string    Actor,
    DateTime  OcurridoAt,
    string?   Referencia,
    string?   Detalle
);

public record ClientHistoryDto(
    List<ClientActivityItemDto> Items,
    int Total,
    int Page,
    int PageSize
);


public record ClientSearchDto(
    string? Query,
    string? Zone,
    string? Status,
    string? PlanId,
    bool?   HasDebt,
    bool?   HasEmail,
    int     Page     = 1,
    int     PageSize = 25
);

public record ClientSearchResultDto(
    List<ClientListItemDto> Items,
    int    Total,
    int    Page,
    int    PageSize,
    string? AppliedQuery
);
