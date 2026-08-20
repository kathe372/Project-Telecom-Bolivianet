export interface PaymentListItemDto {
  Id:                    string;
  ClientId:              string;
  TbnCode:               string;
  ClientName:            string;
  Amount:                number;
  Method:                string;
  Bank:                  string | null;
  BankReference:         string | null;
  PaidAt:                string;
  RegisteredAt:          string;
  RegisteredByName:      string;
  FromWhatsApp:          boolean;
  ReceiptImageUrl:       string | null;
  PhysicalReceiptNumber: string | null;
  CoveredMonths:         string[];
  PlanName:              string;
  IsVoided:              boolean;
}

export interface PaymentDetailDto extends PaymentListItemDto {
  ClientPhone:  string;
  CanVoid:      boolean;
  IsVoided:     boolean;
}

export interface PaymentFilterDto {
  search?:     string;
  method?:     string;
  origin?:     string;
  from?:       string;
  to?:         string;
  pageNumber?: number;
  pageSize?:   number;
}

export interface DuplicateCheckResultDto {
  IsPossibleDuplicate: boolean;
  ExistingPaymentId:   string | null;
  ExistingPaidAt:      string | null;
  ExistingAmount:      number | null;
  ExistingMethod:      string | null;
  RegisteredByName:    string | null;
}

export interface CollectionByUserDto {
  UserName: string;
  Count:    number;
  Total:    number;
}

export interface CollectionReportDto {
  From:             string;
  To:               string;
  TotalCollected:   number;
  TotalPayments:    number;
  AveragePayment:   number;
  CollectedCash:    number;
  CollectedDeposit: number;
  CollectedQr:      number;
  ByUser:           CollectionByUserDto[];
  Payments:         PaymentListItemDto[];
}

export interface ReminderJobResultDto {
  Sent:       number;
  Skipped:    number;
  Errors:     number;
  ExecutedAt: string;
}
