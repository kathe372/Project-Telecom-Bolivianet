
export interface PlanDto {
  Id:           string;
  Name:         string;
  SpeedMb:      number;
  MonthlyPrice: number;
  IsActive:     boolean;
  DisplayLabel: string;
}

export interface PlanHistoryDto {
  Id:            string;
  PlanId:        string;
  Name:          string;
  SpeedMb:       number;
  MonthlyPrice:  number;
  IsActive:      boolean;
  DisplayLabel:  string;
  ChangedAt:     string;
  ChangedByName: string;
  ChangeReason:  string | null;
}


export type ClientStatus = 'Activo' | 'Suspendido' | 'DadoDeBaja';

export interface ClientListItemDto {
  Id:            string;
  TbnCode:       string;
  FullName:      string;
  Zone:          string;
  PhoneMain:     string;
  PlanName:      string;
  HasTvCable:    boolean;
  Status:        ClientStatus;
  TotalDebt:     number;
  PendingMonths: number;
  SuspendedAt?:  string | null;
  CreditBalance: number;
  Email?:        string;
}

export interface ClientDetailDto {
  Id:                string;
  TbnCode:           string;
  FullName:          string;
  IdentityCard:      string;
  PhoneMain:         string;
  PhoneSecondary:    string | null;
  Zone:              string;
  Street:            string | null;
  LocationRef:       string | null;
  GpsLatitude:       number | null;
  GpsLongitude:      number | null;
  WinboxNumber:      string;
  InstallationDate:  string;
  InstalledByUserId: string;
  InstalledByName:   string;
  Plan:              PlanDto;
  HasTvCable:        boolean;
  OnuSerialNumber:   string | null;
  Status:            ClientStatus;
  SuspendedAt:       string | null;
  CancelledAt:       string | null;
  TotalDebt:         number;
  PendingMonths:     number;
  CreditBalance:     number;
  Email?:            string;
  LastPaymentDate:   string | null;
  InstallationPaid:  boolean;
  CreatedAt:         string;
  CajaNapId?:        string | null;
  CajaNap?:          string | null;
}


export type InvoiceStatus = 'Emitida' | 'Enviada' | 'Pendiente' | 'Vencida' | 'ParcialmentePagada' | 'Pagada' | 'Anulada';
export type InvoiceType   = 'Mensualidad' | 'Instalacion';

export interface InvoiceDto {
  Id:       string;
  Type:     InvoiceType;
  Status:   InvoiceStatus;
  Year:     number;
  Month:    number;
  Amount:   number;
  IssuedAt: string;
  DueDate:  string;
  Notes:    string | null;
}

export interface PaymentSummaryDto {
  Id:                    string;
  Amount:                number;
  Method:                string;
  Bank:                  string | null;
  BankReference:         string | null;
  PhysicalReceiptNumber: string | null;
  PaidAt:                string;
  RegisteredAt:          string;
  RegisteredByName:      string;
  FromWhatsApp:          boolean;
  ReceiptImageUrl:       string | null;
  CanVoid:               boolean;
  IsVoided:              boolean;
  CoveredMonths:         string[];
}

export interface InvoiceGridDto {
  Invoices:        InvoiceDto[];
  Payments:        PaymentSummaryDto[];
  TotalDebt:       number;
  PendingMonths:   number;
  CreditBalance:   number;
  Email?:          string;
  LastPaymentDate: string | null;
}


export type PaymentMethod = 'Efectivo' | 'DepositoBancario' | 'QR';

export interface RegisterPaymentRequest {
  ClientId:              string;
  Amount:                number;
  Method:                PaymentMethod;
  Bank?:                 string;
  PaidAt:                string;
  PhysicalReceiptNumber?: string;
  InvoiceIds:            string[];
  ConfirmedDuplicate?:   boolean;
}


export interface RegisterClientRequest {
  FullName:              string;
  IdentityCard:          string;
  PhoneMain:             string;
  PhoneSecondary?:       string;
  Zone:                  string;
  Street?:               string;
  LocationRef?:          string;
  GpsLatitude?:          number;
  GpsLongitude?:         number;
  WinboxNumber:          string;
  InstallationDate:      string;
  InstalledByUserId:     string;
  PlanId:                string;
  HasTvCable:            boolean;
  OnuSerialNumber?:      string;
  InstallationCost:      number;
  PaidInstallation:      boolean;
  PaidFirstMonth:        boolean;
  PaymentMethod?:        PaymentMethod;
  Bank?:                 string;
  PhysicalReceiptNumber?: string;
  /** Instalación de origen (conversión prospecto→cliente). */
  InstallationId?:       string;
}

export interface UpdateClientRequest {
  FullName:          string;
  IdentityCard:      string;
  PhoneMain:         string;
  PhoneSecondary?:   string;
  Zone:              string;
  Street?:           string;
  LocationRef?:      string;
  GpsLatitude?:      number;
  GpsLongitude?:     number;
  WinboxNumber:      string;
  PlanId:            string;
  HasTvCable:        boolean;
  OnuSerialNumber?:  string;
}


export interface ClientQrInfoDto {
  ImageUrl:       string;
  UploadedAt:     string;
  ExpiresAt:      string | null;
  DaysUntilExpiry: number | null;
}


export interface PlanChangeRequestDto {
  Id:            string;
  PlanAnterior:  string;
  PlanNuevo:     string;
  SolicitadoAt:  string;
  Notes:         string | null;
  ClienteTbn?:    string;
  ClienteNombre?: string;
  FechaEfectiva?: string;
}

export interface PlanChangeHistoryDto {
  Id:             string;
  PlanAnterior:   string;
  PlanNuevo:      string;
  // 'Aprobado' = aceptado pero aún NO aplicado (downgrade que entra a fin de mes).
  // 'Aplicado' = ya ejecutado sobre el plan del cliente.
  Status:         'Pendiente' | 'Aprobado' | 'Aplicado' | 'Rechazado' | 'Cancelado';
  FechaEfectiva:  string;
  MidMonthChange: boolean;
  SolicitadoAt:   string;
  ProcesadoAt:    string | null;
  MotivoRechazo:  string | null;
  Notes:          string | null;
}


export interface ClientFilterDto {
  Search?:      string;
  Status?:      string;
  PlanId?:      string;
  DebtFilter?:  string;
  SortBy?:      string;
  PageNumber?:  number;
  PageSize?:    number;
}
