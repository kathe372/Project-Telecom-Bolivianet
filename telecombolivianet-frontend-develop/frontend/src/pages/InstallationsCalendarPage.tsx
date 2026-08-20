import { useEffect, useMemo, useState, useCallback } from 'react';
import { Loader2, X } from 'lucide-react';
import {
  Calendar as BigCalendar, dateFnsLocalizer, Views,
  type View, type Event as RbcEvent, type SlotInfo,
} from 'react-big-calendar';
import withDragAndDrop, {
  type withDragAndDropProps,
} from 'react-big-calendar/lib/addons/dragAndDrop';
import { format, parse, startOfWeek, getDay, startOfMonth, endOfMonth, endOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';

import {
  getCalendarEvents, getTicketCalendarVisits, getTechnicians, rescheduleInstallation,
  STATUS_COLOR, STATUS_LABEL,
} from '@/services/installationService';
import { ticketService } from '@/services/ticketService';
import { userService } from '@/services/userService';
import { TicketDetailModal } from '@/components/tickets/TicketDetailModal';
import type { TicketDetailDto } from '@/types/ticket.types';
import type { UserSystemDto } from '@/types/auth.types';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuthStore } from '@/store/authStore';
import {
  toCalendarEvent, toTicketCalendarEvent, toIsoDate, slotToDefaults, actionsForStatus,
  buildResources, filterByStatus, isDraggableStatus, durationMinutes, TICKET_TYPE_COLOR,
  type CalendarEvent, type CalendarAction, type TecnicoOption,
} from '@/utils/calendarEvents';
import type { AgendaItemDto } from '@/types/installation.types';

const DnDCalendar = withDragAndDrop<CalendarEvent, object>(BigCalendar);
import { NewInstallationModal } from '@/components/installations/NewInstallationModal';
import { CompleteModal } from '@/components/installations/CompleteModal';
import { CancelModal } from '@/components/installations/CancelModal';
import { NoShowModal } from '@/components/installations/NoShowModal';
import { AssignBoxModal } from '@/components/installations/AssignBoxModal';
import type { InstallationListItemDto } from '@/types/installation.types';

const localizer = dateFnsLocalizer({
  format, parse, startOfWeek, getDay, locales: { es },
});

const MESSAGES = {
  date: 'Fecha', time: 'Hora', event: 'Instalación',
  allDay: 'Todo el día', week: 'Semana', work_week: 'Semana laboral',
  day: 'Día', month: 'Mes', previous: 'Anterior', next: 'Siguiente',
  yesterday: 'Ayer', tomorrow: 'Mañana', today: 'Hoy', agenda: 'Agenda',
  noEventsInRange: 'No hay instalaciones ni visitas en este rango.',
  showMore: (total: number) => `+${total} más`,
};

const VIEWS: View[] = [Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA];

const ACTION_META: Record<CalendarAction, { label: string; cls: string }> = {
  complete:  { label: 'Completar',     cls: 'bg-green-600 hover:bg-green-700' },
  noshow:    { label: 'No realizada',  cls: 'bg-orange-600 hover:bg-orange-700' },
  cancel:    { label: 'Cancelar',      cls: 'bg-red-600 hover:bg-red-700' },
  assignBox: { label: 'Asignar caja',  cls: 'bg-blue-600 hover:bg-blue-700' },
};

/** Rango generoso (mes visible + semanas de relleno) que cubre cualquier vista. */
function rangeForDate(date: Date): { desde: string; hasta: string } {
  const desde = startOfWeek(startOfMonth(date), { weekStartsOn: 1 });
  const hasta = endOfWeek(endOfMonth(date),   { weekStartsOn: 1 });
  return { desde: toIsoDate(desde), hasta: toIsoDate(hasta) };
}

export default function InstallationsCalendarPage() {
  usePageTitle('Calendario de instalaciones');

  const role    = useAuthStore(s => s.role);
  const isAdmin = role === 'Admin';

  const [events,  setEvents]  = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [view,    setView]    = useState<View>(Views.MONTH);
  const [date,    setDate]    = useState<Date>(new Date());

  // Tablero de despacho por técnico (Fase 3, solo-Admin).
  const [technicians, setTechnicians] = useState<TecnicoOption[]>([]);
  const [byTech,      setByTech]      = useState(false);
  const [fTecnico,    setFTecnico]    = useState('');
  const [fStatus,     setFStatus]     = useState('');

  // Crear desde un hueco.
  const [newSlot, setNewSlot] = useState<{ fecha: string; hora: string } | null>(null);
  // Popover de una cita (instalación con acciones, o visita de ticket solo lectura).
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  // Modal de acción abierto (solo aplica a instalaciones).
  const [action, setAction] = useState<{ type: CalendarAction; inst: InstallationListItemDto } | null>(null);
  // Detalle completo del ticket, abierto desde la visita en el calendario.
  const [ticketDetail, setTicketDetail] = useState<TicketDetailDto | null>(null);
  const [ticketTechs,  setTicketTechs]  = useState<UserSystemDto[]>([]);
  const [openingTicket, setOpeningTicket] = useState(false);

  const load = useCallback(async (d: Date, tecnicoId?: string) => {
    setLoading(true);
    setError('');
    try {
      const { desde, hasta } = rangeForDate(d);
      const [installations, ticketVisits] = await Promise.all([
        getCalendarEvents(desde, hasta, tecnicoId || undefined),
        getTicketCalendarVisits(desde, hasta, tecnicoId || undefined),
      ]);
      setEvents([
        ...installations.map(toCalendarEvent),
        ...ticketVisits.map(toTicketCalendarEvent),
      ]);
    } catch {
      setError('No se pudo cargar el calendario.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(date, fTecnico); }, [date, fTecnico, load]);

  useEffect(() => {
    if (isAdmin) getTechnicians().then(setTechnicians).catch(() => {});
  }, [isAdmin]);

  const handleSelectSlot = useCallback((slot: SlotInfo) => {
    setNewSlot(slotToDefaults(slot.start as Date, view === Views.MONTH));
  }, [view]);

  const handleSelectEvent = useCallback((event: RbcEvent) => {
    setSelected(event as CalendarEvent);
  }, []);

  const refreshAndClose = useCallback(() => {
    setNewSlot(null);
    setSelected(null);
    setAction(null);
    load(date, fTecnico);
  }, [date, fTecnico, load]);

  const handleOpenTicket = useCallback(async (ticketId: string) => {
    setOpeningTicket(true);
    try {
      const [detail, techs] = await Promise.all([
        ticketService.getById(ticketId),
        ticketTechs.length ? Promise.resolve(ticketTechs) : userService.getAll(1, 100)
          .then(res => res.Items.filter(u => u.Role === 'Admin' || u.Role === 'Tecnico')),
      ]);
      setTicketTechs(techs);
      setTicketDetail(detail);
      setSelected(null);
    } catch {
      setError('No se pudo abrir el ticket.');
    } finally {
      setOpeningTicket(false);
    }
  }, [ticketTechs]);

  const enableByTech = useCallback((on: boolean) => {
    setByTech(on);
    // Las columnas por técnico solo se ven en Semana/Día.
    if (on && view === Views.MONTH) setView(Views.WEEK);
    if (!on) setFTecnico('');
  }, [view]);

  const shownEvents = useMemo(() => filterByStatus(events, fStatus), [events, fStatus]);
  const resources   = byTech ? buildResources(technicians, fTecnico) : undefined;

  // Reprogramar arrastrando/redimensionando: optimista con reversión si el
  // backend rechaza (p. ej. sin capacidad en la nueva franja).
  const applyReschedule = async (ev: CalendarEvent, start: Date, end: Date, withDuration: boolean) => {
    if (ev.kind !== 'installation' || !isDraggableStatus(ev.status)) return;
    const snapshot = events;
    const { fecha, hora } = slotToDefaults(start, false);
    const dto: { Fecha: string; HoraInicio: string; DuracionMin?: number } = { Fecha: fecha, HoraInicio: hora };
    if (withDuration) dto.DuracionMin = durationMinutes(start, end);
    setEvents(prev => prev.map(e => (e.id === ev.id ? { ...e, start, end } : e)));   // optimista
    try {
      await rescheduleInstallation(ev.raw.Id, dto);
      load(date, fTecnico);                       // reconcilia con el servidor (status → Pendiente)
    } catch {
      setEvents(snapshot);                          // revierte el movimiento
      setError('No se pudo reprogramar la cita (posible falta de disponibilidad).');
    }
  };

  const handleEventDrop: withDragAndDropProps<CalendarEvent>['onEventDrop'] = ({ event, start, end }) =>
    applyReschedule(event, start as Date, end as Date, false);
  const handleEventResize: withDragAndDropProps<CalendarEvent>['onEventResize'] = ({ event, start, end }) =>
    applyReschedule(event, start as Date, end as Date, true);

  const eventStyleGetter = useMemo(() => (event: RbcEvent) => {
    const ce = event as CalendarEvent;
    if (ce.kind === 'ticket') {
      const raw = ce.raw as AgendaItemDto;
      const cls = TICKET_TYPE_COLOR[raw.Type] ?? 'bg-slate-200 text-slate-800';
      // Borde punteado: marca visualmente que es una visita de ticket (solo
      // lectura), no una instalación arrastrable.
      return { className: `${cls} rounded text-[11px] px-1 border border-dashed border-current opacity-90` };
    }
    const cls = STATUS_COLOR[ce.status as keyof typeof STATUS_COLOR] ?? 'bg-gray-100 text-gray-700';
    return { className: `${cls} !border-0 rounded text-[11px] px-1` };
  }, []);

  const selectedActions = selected?.kind === 'installation' ? actionsForStatus(selected.status) : [];

  return (
    <div className="p-6 space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Calendario de instalaciones</h1>
        {loading && <Loader2 className="w-5 h-5 animate-spin text-blue-500" />}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {}
      {isAdmin && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={byTech} onChange={e => enableByTech(e.target.checked)} className="rounded" />
            👷 Ver por técnico
          </label>

          {byTech && (
            <select
              value={fTecnico}
              onChange={e => setFTecnico(e.target.value)}
              className="border rounded-lg px-2 py-1 text-sm"
            >
              <option value="">Todos los técnicos</option>
              {technicians.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          )}

          <select
            value={fStatus}
            onChange={e => setFStatus(e.target.value)}
            className="border rounded-lg px-2 py-1 text-sm"
          >
            <option value="">Todos los estados</option>
            {Object.entries(STATUS_LABEL).map(([k, label]) => (
              <option key={k} value={k}>{label as string}</option>
            ))}
          </select>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-3 flex-1 min-h-[600px]">
        <DnDCalendar
          localizer={localizer}
          culture="es"
          messages={MESSAGES}
          events={shownEvents}
          resources={resources}
          view={view}
          onView={setView}
          date={date}
          onNavigate={setDate}
          views={VIEWS}
          selectable
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          resizable
          onEventDrop={handleEventDrop}
          onEventResize={handleEventResize}
          draggableAccessor={(event) => {
            const ce = event as CalendarEvent;
            return ce.kind === 'installation' && isDraggableStatus(ce.status);
          }}
          popup
          startAccessor="start"
          endAccessor="end"
          eventPropGetter={eventStyleGetter}
          style={{ height: '100%' }}
        />
      </div>

      {}
      {newSlot && (
        <NewInstallationModal
          defaultFecha={newSlot.fecha}
          defaultHora={newSlot.hora}
          onClose={() => setNewSlot(null)}
          onDone={refreshAndClose}
        />
      )}

      {}
      {selected && !action && selected.kind === 'installation' && (() => {
        const inst = selected.raw as InstallationListItemDto;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => setSelected(null)}
          >
            <div
              className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-1">
                <h3 className="text-base font-medium text-gray-900">{inst.ClienteNombre}</h3>
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-gray-500 mb-1">{inst.ClienteTbn}</p>
              <p className="text-sm text-gray-600 mb-4">
                {inst.Fecha} {inst.HoraInicio} ·{' '}
                <span className="font-medium">
                  {STATUS_LABEL[inst.Status as keyof typeof STATUS_LABEL] ?? inst.Status}
                </span>
                {inst.BoxCodigo && <> · Caja {inst.BoxCodigo}</>}
              </p>

              {selectedActions.length === 0 ? (
                <p className="text-xs text-gray-400">Sin acciones disponibles para este estado.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {selectedActions.map((a) => (
                    <button
                      key={a}
                      onClick={() => setAction({ type: a, inst })}
                      className={`px-3 py-1.5 text-sm text-white rounded-lg ${ACTION_META[a].cls}`}
                    >
                      {ACTION_META[a].label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {}
      {selected && selected.kind === 'ticket' && (() => {
        const t = selected.raw as AgendaItemDto;
        const phone = t.ClientePhone && t.ClientePhone !== '—' ? t.ClientePhone : null;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => setSelected(null)}
          >
            <div
              className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-1">
                <h3 className="text-base font-medium text-gray-900">{t.ClienteNombre}</h3>
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-gray-500 mb-1">Visita de ticket — {t.Type}</p>
              <p className="text-sm text-gray-600 mb-2">
                {t.Fecha} {t.HoraInicio}–{t.HoraFin} · <span className="font-medium">{t.Status}</span>
              </p>
              <p className="text-xs text-gray-500 mb-1">{t.Direccion}</p>
              {t.Notas && <p className="text-xs text-gray-400 italic mb-3">{t.Notas}</p>}
              <div className="flex items-center gap-3 mb-3">
                {phone && (
                  <a
                    href={`https://wa.me/${phone.replace(/\D/g, '')}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-xs text-green-700 hover:underline"
                  >
                    WhatsApp {phone}
                  </a>
                )}
                {t.MapsLink && (
                  <a href={t.MapsLink} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                    Ver mapa
                  </a>
                )}
              </div>
              {t.TicketId && (
                <button
                  onClick={() => handleOpenTicket(t.TicketId!)}
                  disabled={openingTicket}
                  className="w-full text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg px-3 py-1.5 mb-2"
                >
                  {openingTicket ? 'Abriendo…' : 'Abrir ticket →'}
                </button>
              )}
              <p className="text-xs text-gray-400">
                Las demás acciones sobre este ticket se hacen desde su detalle.
              </p>
            </div>
          </div>
        );
      })()}

      {}
      {ticketDetail && (
        <TicketDetailModal
          ticket={ticketDetail}
          technicians={ticketTechs}
          isAdmin={isAdmin}
          onClose={() => setTicketDetail(null)}
          onRefresh={() => { setTicketDetail(null); load(date, fTecnico); }}
        />
      )}

      {}
      {action?.type === 'complete' && (
        <CompleteModal instalacion={action.inst} onClose={() => setAction(null)} onDone={refreshAndClose} />
      )}
      {action?.type === 'cancel' && (
        <CancelModal instalacion={action.inst} onClose={() => setAction(null)} onDone={refreshAndClose} />
      )}
      {action?.type === 'noshow' && (
        <NoShowModal instalacion={action.inst} onClose={() => setAction(null)} onDone={refreshAndClose} />
      )}
      {action?.type === 'assignBox' && (
        <AssignBoxModal instalacion={action.inst} onClose={() => setAction(null)} onDone={refreshAndClose} />
      )}
    </div>
  );
}
