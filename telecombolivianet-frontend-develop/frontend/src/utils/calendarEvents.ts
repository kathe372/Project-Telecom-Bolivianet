import type { InstallationListItemDto, AgendaItemDto } from '@/types/installation.types';

/**
 * Lógica pura del calendario, separada de react-big-calendar para poder testearla
 * sin renderizar RBC en jsdom (área 0×0). Ver PLAN_CALENDARIO.md (Fase 1, §v4).
 */

export interface CalendarEvent {
  id:         string;
  title:      string;
  start:      Date;
  end:        Date;
  status:     string;
  resourceId: string;           // TecnicoId (o 'sin-asignar') → columna (Fase 3)
  // 'installation': cita editable (arrastrar/redimensionar + acciones propias).
  // 'ticket': visita de ticket, solo lectura — no comparte acciones de instalación.
  kind:       'installation' | 'ticket';
  raw:        InstallationListItemDto | AgendaItemDto;
}

export const SIN_ASIGNAR = 'sin-asignar';

const DEFAULT_DURATION_MIN = 120;

/**
 * Construye el `Date` de inicio **desde los componentes** de `Fecha` (yyyy-MM-dd) y
 * `HoraInicio` (HH:mm) — NUNCA desde un ISO/UTC — para mostrar la hora de pared
 * (Bolivia) sin desfase de zona.
 */
export function buildEventStart(fecha: string, hora: string): Date {
  const [y, m, d] = fecha.split('-').map(Number);
  const [hh, mm]  = (hora ?? '00:00').split(':').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0);
}

export function buildEventEnd(start: Date, duracionMin?: number | null): Date {
  const mins = duracionMin && duracionMin > 0 ? duracionMin : DEFAULT_DURATION_MIN;
  return new Date(start.getTime() + mins * 60_000);
}

export function toCalendarEvent(dto: InstallationListItemDto): CalendarEvent {
  const start = buildEventStart(dto.Fecha, dto.HoraInicio);
  return {
    id:         dto.Id,
    title:      `${dto.HoraInicio} ${dto.ClienteNombre}`,
    start,
    end:        buildEventEnd(start, dto.DuracionMin),
    status:     dto.Status,
    resourceId: dto.TecnicoId ?? SIN_ASIGNAR,
    kind:       'installation',
    raw:        dto,
  };
}

/** Visita de ticket → evento de calendario solo lectura (sin duración editable). */
export function toTicketCalendarEvent(dto: AgendaItemDto): CalendarEvent {
  const start = buildEventStart(dto.Fecha, dto.HoraInicio);
  const [hh, mm] = (dto.HoraFin ?? '').split(':').map(Number);
  const end = Number.isFinite(hh) && Number.isFinite(mm)
    ? new Date(start.getFullYear(), start.getMonth(), start.getDate(), hh, mm)
    : buildEventEnd(start, null);
  return {
    id:         dto.Id,
    title:      `${dto.HoraInicio} ${dto.ClienteNombre}`,
    start,
    end,
    status:     dto.Status,
    resourceId: dto.TecnicoId ?? SIN_ASIGNAR,
    kind:       'ticket',
    raw:        dto,
  };
}

/** Formatea un `Date` local como `yyyy-MM-dd` (sin tocar zona horaria). */
export function toIsoDate(d: Date): string {
  const y  = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

/**
 * Normaliza el rango visible que entrega react-big-calendar (`onRangeChange`),
 * que varía por vista: array de días (mes/agenda) o `{ start, end }` (semana/día).
 */
export function visibleRange(
  range: Date[] | { start: Date; end: Date },
): { desde: string; hasta: string } {
  if (Array.isArray(range)) {
    const sorted = [...range].sort((a, b) => a.getTime() - b.getTime());
    return { desde: toIsoDate(sorted[0]), hasta: toIsoDate(sorted[sorted.length - 1]) };
  }
  return { desde: toIsoDate(range.start), hasta: toIsoDate(range.end) };
}

/**
 * Valores por defecto para crear una instalación desde un hueco del calendario.
 * En vista Mes el clic es un día completo (medianoche) → hora vacía (el usuario la
 * elige); en Semana/Día el clic trae la hora real del slot.
 */
export function slotToDefaults(
  start: Date, isMonthView: boolean,
): { fecha: string; hora: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    fecha: toIsoDate(start),
    hora:  isMonthView ? '' : `${pad(start.getHours())}:${pad(start.getMinutes())}`,
  };
}

export type CalendarAction = 'complete' | 'noshow' | 'cancel' | 'assignBox';

/** Acciones disponibles en el popover de una cita según su estado. */
export function actionsForStatus(status: string): CalendarAction[] {
  switch (status) {
    case 'Pendiente':
    case 'EnProceso':
    case 'Reprogramada':
      return ['complete', 'noshow', 'cancel'];
    case 'Completada':
      return ['assignBox'];
    default:
      return [];   // Cancelada / NoRealizada: sin acciones
  }
}

export interface TecnicoOption { id: string; nombre: string; }
export interface CalendarResource { resourceId: string; resourceTitle: string; }

/**
 * Columnas del tablero de despacho (Fase 3). Con un técnico filtrado → una sola
 * columna; sin filtro → todos los técnicos + "Sin asignar".
 */
export function buildResources(
  technicians: TecnicoOption[], filterTecnicoId?: string,
): CalendarResource[] {
  if (filterTecnicoId) {
    const t = technicians.find(x => x.id === filterTecnicoId);
    return t ? [{ resourceId: t.id, resourceTitle: t.nombre }] : [];
  }
  return [
    ...technicians.map(t => ({ resourceId: t.id, resourceTitle: t.nombre })),
    { resourceId: SIN_ASIGNAR, resourceTitle: 'Sin asignar' },
  ];
}

/** Filtro por estado (cliente). Estado vacío → sin filtrar. */
export function filterByStatus(events: CalendarEvent[], status: string): CalendarEvent[] {
  return status ? events.filter(e => e.status === status) : events;
}

const TERMINAL_STATUSES = ['Completada', 'Cancelada', 'NoRealizada'];

/** ¿La cita puede arrastrarse/redimensionarse? (reprogramar rechaza estados terminales) */
export function isDraggableStatus(status: string): boolean {
  return !TERMINAL_STATUSES.includes(status);
}

/** Minutos entre dos fechas (para la nueva duración al redimensionar). */
export function durationMinutes(start: Date, end: Date): number {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000));
}

/** Color por tipo de ticket, para las visitas solo-lectura en el calendario
 * de instalaciones (mismo criterio de color que "Mi Agenda"). */
export const TICKET_TYPE_COLOR: Record<string, string> = {
  SoporteTecnico:       'bg-red-100 text-red-800',
  InstalacionNueva:     'bg-emerald-100 text-emerald-800',
  CambioPlan:           'bg-purple-100 text-purple-800',
  TvCable:              'bg-indigo-100 text-indigo-800',
  ReactivacionServicio: 'bg-teal-100 text-teal-800',
  BajaServicio:         'bg-orange-100 text-orange-800',
  RecoleccionEquipo:    'bg-slate-200 text-slate-800',
};
