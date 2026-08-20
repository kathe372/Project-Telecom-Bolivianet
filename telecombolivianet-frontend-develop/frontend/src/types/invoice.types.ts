export interface InvoiceMonthStatsDto {
  Year:           number;
  Month:          number;
  TotalBilled:    number;
  TotalCollected: number;
  TotalPending:   number;
  CountBilled:    number;
  CountCollected: number;
  CountPending:   number;
  CountOverdue:   number;
  CollectionRate: number;
}

export interface InvoiceRangeStatsDto {
  DateFrom:       string;
  DateTo:         string;
  TotalBilled:    number;
  TotalCollected: number;
  TotalPending:   number;
  CountBilled:    number;
  CountCollected: number;
  CountPending:   number;
  CountOverdue:   number;
  CollectionRate: number;
}

export interface InvoiceDetailDto {
  Id:            string;
  ClientId:      string;
  TbnCode:       string;
  ClientName:    string;
  PlanName:      string;
  Type:          string;
  Status:        'Pendiente' | 'Pagada' | 'Vencida' | 'Anulada';
  Year:          number;
  Month:         number;
  Amount:        number;
  IssuedAt:      string;
  DueDate:       string;
  Notes:         string | null;
  UpdatedAt:     string | null;
  PaymentMethod: string | null;
  PaymentBank:   string | null;
  PaidAt:        string | null;
  PaidByName:    string | null;
}

export interface BillingJobResultDto {
  Generated:    number;
  Skipped:      number;
  ExcludedBaja: number;
  Errors:       number;
  Period:       string;
}

export interface BillingPreviewDto {
  ToGenerate:     number;
  AlreadyBilled:  number;
  ExcludedBaja:   number;
  WithErrors:     number;
  EstimatedTotal: number;
  Period:         string;
}

export interface AnnualReportCellDto {
  Month:         number;
  Label:         string;
  Status:        'Pagada' | 'Pendiente' | 'Vencida' | 'Anulada' | 'NoAplica' | 'NoGenerada';
  Amount:        number;
  PaymentMethod: string | null;
  PaidAt:        string | null;
  InvoiceId:     string | null;
}

export interface AnnualReportRowDto {
  ClientId:   string;
  TbnCode:    string;
  ClientName: string;
  Zone:       string;
  PlanName:   string;
  Cells:      AnnualReportCellDto[];
}


export interface InvoicePendienteDto {
  Id:            string;
  InvoiceNumber: string;
  Status:        string;
  Year:          number;
  Month:         number;
  Amount:        number;
  DueDate:       string;
  Notes:         string | null;
}

export interface DebtorDto {
  ClientId:          string;
  TbnCode:           string;
  FullName:          string;
  Zone:              string;
  PlanName:          string;
  MesesPendientes:   number;
  TotalDeuda:        number;
  UltimoVencimiento: string;
  Facturas:          InvoicePendienteDto[];
}
