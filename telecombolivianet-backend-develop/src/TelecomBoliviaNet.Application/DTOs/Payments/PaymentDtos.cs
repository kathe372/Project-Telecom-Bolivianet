namespace TelecomBoliviaNet.Application.DTOs.Payments;


public record PaymentListItemDto(
    Guid      Id,
    Guid      ClientId,
    string    TbnCode,
    string    ClientName,
    decimal   Amount,
    string    Method,
    string?   Bank,
    string?   BankReference,
    DateTime  PaidAt,
    DateTime  RegisteredAt,
    string    RegisteredByName,
    bool      FromWhatsApp,
    string?   ReceiptImageUrl,
    string?   PhysicalReceiptNumber,
    IEnumerable<string> CoveredMonths,
    string    PlanName,
    bool      IsVoided
);

public record PaymentDetailDto(
    Guid      Id,
    Guid      ClientId,
    string    TbnCode,
    string    ClientName,
    string    ClientPhone,
    decimal   Amount,
    string    Method,
    string?   Bank,
    string?   BankReference,
    DateTime  PaidAt,
    DateTime  RegisteredAt,
    string    RegisteredByName,
    bool      FromWhatsApp,
    string?   ReceiptImageUrl,
    string?   PhysicalReceiptNumber,
    IEnumerable<string> CoveredMonths,
    bool      CanVoid,
    bool      IsVoided
);

public record PaymentFilterDto(
    string?   Search      = null,
    string?   Method      = null,
    string?   Origin      = null,
    DateTime? From        = null,
    DateTime? To          = null,
    int       PageNumber  = 1,
    int       PageSize    = 25
);


public record VoidPaymentDto(string Justification);

public record VoidPaymentResultDto(
    int     InvoicesReverted,
    string  Message
);


public record AttachReceiptDto(string ReceiptImageUrl);


public record CollectionReportDto(
    DateTime  From,
    DateTime  To,
    decimal   TotalCollected,
    int       TotalPayments,
    decimal   AveragePayment,
    decimal   CollectedCash,
    decimal   CollectedDeposit,
    decimal   CollectedQr,
    IEnumerable<CollectionByUserDto>    ByUser,
    IEnumerable<PaymentListItemDto>     Payments
);

public record CollectionByUserDto(
    string  UserName,
    int     Count,
    decimal Total
);


public record DuplicateCheckResultDto(
    bool      IsPossibleDuplicate,
    Guid?     ExistingPaymentId,
    DateTime? ExistingPaidAt,
    decimal?  ExistingAmount,
    string?   ExistingMethod,
    string?   RegisteredByName
);


public record ReminderJobResultDto(
    int     Sent,
    int     Skipped,
    int     Errors,
    string  ExecutedAt
);


public record RegisterPaymentDto(
    Guid       ClientId,
    decimal    Amount,
    string     Method,
    string?    Bank,
    DateTime   PaidAt,
    List<Guid> InvoiceIds,
    string?    PhysicalReceiptNumber,
    string?    BankReference       = null,
    bool?      ConfirmedDuplicate  = null
);

public record PaymentRegisteredDto(
    Guid    PaymentId,
    string  ReceiptNumber,
    decimal AmountPaid,
    decimal CreditGenerated,
    decimal CreditUsed,
    string  Message
);

public record RefundCreditDto(string Justificacion);


public record CashCloseDto(
    Guid     Id,
    Guid     UserId,
    string   OperatorName,
    DateTime StartedAt,
    DateTime? ClosedAt,
    decimal  TotalAmount,
    int      PagosValidados,
    int      PagosRechazados,
    List<TelecomBoliviaNet.Domain.Entities.Payments.CashCloseChannelDetail> Detalle,
    bool     IsClosed,
    string?  PdfPath
);


public record CollectionReportByOperatorDto(
    DateTime  From,
    DateTime  To,
    decimal   TotalAmount,
    int       Count,
    string?   OperatorName,
    List<PaymentReportRowDto> Payments,
    List<OperatorDropdownDto> Operators
);

public record PaymentReportRowDto(
    Guid     Id,
    string   TbnCode,
    string   ClientName,
    decimal  Amount,
    string   Method,
    string?  Bank,
    string?  BankReference,
    DateTime PaidAt,
    string   OperatorName,
    string?  PhysicalReceiptNumber,
    bool     FromWhatsApp
);

public record OperatorDropdownDto(Guid Id, string Name);

public record PaymentFilterWithOperatorDto(
    string?   Search      = null,
    string?   Method      = null,
    string?   Origin      = null,
    DateTime? From        = null,
    DateTime? To          = null,
    Guid?     OperatorId  = null,
    int       PageNumber  = 1,
    int       PageSize    = 25
);
