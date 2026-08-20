
export type NotifType =
  | 'SUSPENSION'
  | 'REACTIVACION'
  | 'RECORDATORIO_R1'
  | 'RECORDATORIO_R2'
  | 'RECORDATORIO_R3'
  | 'FACTURA_VENCIDA'
  | 'CONFIRMACION_PAGO'
  | 'TICKET_ASIGNADO'
  | 'TICKET_CREADO'
  | 'TICKET_RESUELTO'
  | 'CAMBIO_PLAN'
  | 'CAMBIO_PRECIO';

export const NOTIF_TYPE_LABELS: Record<NotifType, string> = {
  SUSPENSION:        'Suspensión de Servicio',
  REACTIVACION:      'Reactivación de Servicio',
  RECORDATORIO_R1:   'Recordatorio de Pago',
  RECORDATORIO_R2:   'Recordatorio R2 (deshabilitado)',
  RECORDATORIO_R3:   'Recordatorio R3 (deshabilitado)',
  FACTURA_VENCIDA:   'Factura Vencida',
  CONFIRMACION_PAGO: 'Confirmación de Pago',
  TICKET_ASIGNADO:   'Ticket Asignado (Técnico)',
  TICKET_CREADO:     'Ticket Creado',
  TICKET_RESUELTO:   'Ticket Resuelto',
  CAMBIO_PLAN:       'Cambio de Plan',
  CAMBIO_PRECIO:     'Cambio de Precio del Plan',
};

export const NOTIF_TYPES_ACTIVOS: NotifType[] = [
  'SUSPENSION',
  'REACTIVACION',
  'CONFIRMACION_PAGO',
  'FACTURA_VENCIDA',
  'TICKET_CREADO',
  'TICKET_ASIGNADO',
  'TICKET_RESUELTO',
  'CAMBIO_PLAN',
  'CAMBIO_PRECIO',
];

export type TemplateCategory = 'Cobro' | 'Bienvenida' | 'Tecnico' | 'Ticket' | 'General';
export type HsmStatus = 'Aprobada' | 'Pendiente' | 'Rechazada';

export const HSM_STATUS_COLORS: Record<HsmStatus, string> = {
  Aprobada:  'text-green-600 bg-green-50 border-green-200',
  Pendiente: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  Rechazada: 'text-red-600 bg-red-50 border-red-200',
};

export const CATEGORIA_LABELS: Record<TemplateCategory, string> = {
  Cobro:      'Cobro',
  Bienvenida: 'Bienvenida',
  Tecnico:    'Técnico',
  Ticket:     'Ticket',
  General:    'General',
};

export const ALL_VARIABLES: { variable: string; descripcion: string; categoria: string }[] = [
  { variable: '{{nombre}}',              descripcion: 'Primer nombre del cliente',                     categoria: 'Cliente' },
  { variable: '{{apellido}}',            descripcion: 'Apellido del cliente',                           categoria: 'Cliente' },
  { variable: '{{nombre_completo}}',     descripcion: 'Nombre completo del cliente',                    categoria: 'Cliente' },
  { variable: '{{plan}}',                descripcion: 'Nombre del plan del cliente',                    categoria: 'Cliente' },
  { variable: '{{zona}}',                descripcion: 'Zona del cliente',                               categoria: 'Cliente' },
  { variable: '{{empresa}}',             descripcion: 'Nombre del ISP (SystemConfig)',                  categoria: 'Cliente' },
  { variable: '{{deuda}}',               descripcion: 'Deuda total pendiente en Bs.',                   categoria: 'Cobro' },
  { variable: '{{monto}}',               descripcion: 'Monto de la factura más próxima a vencer',       categoria: 'Cobro' },
  { variable: '{{periodo}}',             descripcion: 'Período de la factura (ej: Enero 2026)',          categoria: 'Cobro' },
  { variable: '{{fecha_vencimiento}}',   descripcion: 'Fecha de vencimiento de la factura más próxima', categoria: 'Cobro' },
  { variable: '{{dias_mora}}',           descripcion: 'Días de mora de la factura más antigua',         categoria: 'Cobro' },
  { variable: '{{meses_mora}}',          descripcion: 'Meses de mora',                                  categoria: 'Cobro' },
  { variable: '{{meses_pendientes}}',    descripcion: 'Cantidad de meses con facturas pendientes',      categoria: 'Cobro' },
  { variable: '{{fecha_corte}}',         descripcion: 'Fecha de corte configurada (SystemConfig)',      categoria: 'Cobro' },
  { variable: '{{meses_deuda_detalle}}', descripcion: 'Lista de meses adeudados con montos y fechas',  categoria: 'Cobro' },
  { variable: '{{qr_enlace}}',           descripcion: 'Enlace directo al QR de pago del cliente',       categoria: 'Cobro' },
  { variable: '{{num_ticket}}',          descripcion: 'Número correlativo del ticket (TK-AAAA-NNNN)',   categoria: 'Ticket' },
  { variable: '{{tecnico}}',             descripcion: 'Nombre del técnico asignado al ticket',           categoria: 'Ticket' },
  { variable: '{{fecha_visita}}',        descripcion: 'Fecha programada de visita técnica',              categoria: 'Ticket' },
];


export interface NotifConfigDto {
  Tipo:           NotifType;
  Activo:         boolean;
  DelaySegundos:  number;
  HoraInicio:     string;
  HoraFin:        string;
  Inmediato:      boolean;
  DiasAntes:      number | null;
  PlantillaId:    string | null;
}

export interface NotifConfigListDto {
  Configs:          NotifConfigDto[];
  HoraServidorLocal: string;
}

export interface NotifTemplateDto {
  Id:               string;
  Tipo:             NotifType;
  Texto:            string;
  Activa:           boolean;
  Categoria:        TemplateCategory;
  HsmStatus:        HsmStatus;
  CreadoAt:         string;
  MetaTemplateName: string | null;
  MetaLanguageCode: string | null;
  MetaParamOrder:   string | null;
}

export interface NotifLogItemDto {
  Id:           string;
  OutboxId:     string;
  Tipo:         NotifType;
  TipoLabel:    string;
  Estado:       string;
  PhoneNumber:  string;
  Mensaje:      string;
  IntentoNum:   number;
  ErrorDetalle: string | null;
  RegistradoAt: string;
  EnviarDesde:  string | null;
}

export interface NotifLogPageDto {
  Items:    NotifLogItemDto[];
  Total:    number;
  Page:     number;
  PageSize: number;
}


export type SegmentOperator = '=' | '!=' | '>' | '<' | '>=' | '<=';
export type SegmentCampo    = 'deuda' | 'dias_mora' | 'zona' | 'plan' | 'estado';

export interface SegmentCondition {
  Campo:    SegmentCampo;
  Operador: SegmentOperator;
  Valor:    string;
}

export interface SegmentConditionGroup {
  Condiciones: SegmentCondition[];
}

export interface NotifSegmentDto {
  Id:                 string;
  Nombre:             string;
  Descripcion:        string | null;
  Reglas:             SegmentConditionGroup[];
  CreadoAt:           string;
  ClientesEstimados:  number | null;
}

export interface TemplatePreviewDto {
  TextoRenderizado:       string;
  VariablesNoEncontradas: string[];
}
