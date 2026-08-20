export type TicketStatus   = 'Abierto' | 'EnProceso' | 'Resuelto' | 'Cerrado' | 'PendienteCliente' | 'EnVisita';
export type TicketPriority = 'Critica' | 'Alta' | 'Media' | 'Baja';
export type TicketType     = 'SoporteTecnico'|'Averia'|'Instalacion'|'Consulta'|'Reclamo'|'Mantenimiento'|'Migracion'|'Bajal'|'InstalacionNueva'|'CambioPlan'|'TvCable'|'ReactivacionServicio'|'BajaServicio'|'RecoleccionEquipo';
export type TicketOrigin   = 'Bot' | 'Manual' | 'Automatico';
export type CommentType    = 'RespuestaCliente' | 'NotaInterna' | 'CausaRaiz';

export interface TicketCommentDto { Id:string; Type:CommentType; Body:string; AuthorName:string; AuthorId:string; CreatedAt:string; }
export interface TicketWorkLogDto  { Id:string; UserName:string; UserId:string; TotalMinutes:number; Notes:string|null; LoggedAt:string; }
export interface TicketVisitDto    { Id:string; ScheduledAt:string; TechnicianName:string|null; TechnicianId:string|null; Observations:string|null; CreatedAt:string; Status:string; }

export interface TicketListItemDto {
  Id:string; ClientName:string; ClientTbn:string; ClientId:string|null;
  Subject:string; Type:TicketType; Priority:TicketPriority; Status:TicketStatus; Origin:TicketOrigin;
  Description:string; SupportGroup:string|null;
  AssignedToName:string|null; AssignedToId:string|null; CreatedByName:string;
  CreatedAt:string; DueDate:string|null; ResolvedAt:string|null;
  FirstRespondedAt:string|null; SlaCompliant:boolean|null; TotalWorkMinutes:number;
  TicketNumber:string|null;
  SlaDeadline:string|null;
  AutoAssigned:boolean;
  NextVisitAt?:string|null;
  NextVisitTechnicianName?:string|null;
}

export interface TicketAttachmentDto {
  Id:string; FileName:string; ContentType:string; FileSizeBytes:number;
  Descripcion:string|null; StoragePath:string; SubidoPorNombre:string; SubidoAt:string;
}

export interface TechnicianLoadDto {
  TecnicoId:string; TecnicoNombre:string; TicketsActivos:number; TicketsCriticos:number;
}
export interface BalancingSummaryDto { Tecnicos: TechnicianLoadDto[]; }

export interface TicketDetailDto extends TicketListItemDto {
  AssignedToUserId:string|null; CreatedByUserId:string; ClosedAt:string|null;
  ResolutionMessage:string|null; RootCause:string|null;
  Comments:TicketCommentDto[]; WorkLogs:TicketWorkLogDto[]; Visits:TicketVisitDto[];
  SlaTotalPausedMinutes:number;
  SlaPausedAt:string|null;
  WhatsAppWarning?:string|null;
  ImageUrl?:string|null;
  ClientGpsLatitude?:number|null;
  ClientGpsLongitude?:number|null;
  ClientZone?:string|null;
  ClientStreet?:string|null;
  ClientLocationRef?:string|null;
  ClientPhone?:string|null;
  ClientPlanName?:string|null;
  ProspectIdentityCard?:string|null;
  ProspectBackupPhone?:string|null;
  InstallationBoxCode?:string|null;
  InstallationZoneName?:string|null;
}

export interface SlaByPriorityDto {
  Priority: string;
  Compliant: number;
  Breached: number;
}

export interface TicketKpiDto {
  TotalOpen:number; TotalInProcess:number; TotalResolved:number; TotalClosed:number;
  OverdueSla:number; CreatedToday:number; SlaCompliantCount:number; SlaBreachedCount:number;
  SlaByPriority: SlaByPriorityDto[];
  AvgResolutionMinutes: number | null;
  AvgFirstResponseMinutes: number | null;
}

export interface TicketFilterRequest {
  Search?:string; Status?:string; Priority?:string; Type?:string;
  AssignedToId?:string; OverdueSla?:boolean;
  DateFrom?:string; DateTo?:string; SlaCompliant?:boolean;
  PageNumber?:number; PageSize?:number;
}

export interface CreateTicketRequest {
  ClientId?:string;
  ProspectName?:string;
  ProspectPhone?:string;
  ProspectIdentityCard?:string;
  Subject:string; Type:string; Priority:string; Description:string;
  SupportGroup?:string; AssignedToUserId?:string; SlaDurationHours?:number; AutoAssign?:boolean;
}
export interface UpdateTicketRequest  { Subject?:string; Description?:string; Priority?:string; SupportGroup?:string; RootCause?:string; }
export interface ChangeTicketStatusRequest { Status:string; ResolutionMessage?:string; }
export interface AssignTicketRequest  { TechnicianId:string; }
export interface AddCommentRequest    { Type:CommentType; Body:string; }
export interface AddWorkLogRequest    { Hours:number; Minutes:number; Notes?:string; }
export interface ScheduleVisitRequest { ScheduledAt:string; TechnicianId?:string; Observations?:string; }
export interface SlaPlanDto { Id:string; Name:string; Priority:string; FirstResponseMinutes:number; ResolutionMinutes:number; Schedule:string; IsActive:boolean; }
export interface CreateSlaPlanRequest { Name:string; Priority:string; FirstResponseMinutes:number; ResolutionMinutes:number; Schedule:string; }

export interface SlaAlertItemDto {
  Id:string; TicketNumber:string; Subject:string; Priority:string; Status:string;
  ClientName:string; AssignedToName:string|null;
  CreatedAt:string; DueDate:string;
  PctElapsed:number;
  Level: 'Breached' | 'Warning' | 'Attention';
}
export interface SlaAlertsDto {
  Breached:  SlaAlertItemDto[];
  Warning:   SlaAlertItemDto[];
  Attention: SlaAlertItemDto[];
}

export interface TicketActivityDto {
  Id:          string;
  Action:      string;
  Description: string;
  UserName:    string;
  UserId:      string | null;
  Timestamp:   string;
}

export interface CannedResponseDto {
  Id:        string;
  Title:     string;
  Body:      string;
  Category:  string | null;
  IsActive:  boolean;
  CreatedAt: string;
}
