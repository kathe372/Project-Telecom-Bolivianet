import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import InstallationsCalendarPage from './InstallationsCalendarPage';
import * as installationService from '@/services/installationService';
import {
  toCalendarEvent, buildEventStart, buildEventEnd, visibleRange, toIsoDate,
  slotToDefaults, actionsForStatus, buildResources, filterByStatus, SIN_ASIGNAR,
  isDraggableStatus, durationMinutes,
} from '@/utils/calendarEvents';

// RBC mockeado: expone botones que invocan onSelectSlot/onSelectEvent para poder
// probar la interacción de la página sin depender del layout de la librería en
// jsdom (área 0×0). Ver PLAN_CALENDARIO.md (Fase 1/2, §v4).
vi.mock('react-big-calendar', () => {
  const EV = {
    id: 'i1', status: 'Pendiente', kind: 'installation',
    raw: { Id: 'i1', Status: 'Pendiente', ClienteNombre: 'Ana Rosales',
           ClienteTbn: 'TBN-1', Fecha: '2026-07-15', HoraInicio: '10:00', DuracionMin: 120 },
  };
  return {
    Calendar: (props: any) => (
      <div data-testid="rbc-calendar">
        <button data-testid="rbc-select-slot"
          onClick={() => props.onSelectSlot?.({ start: new Date(2026, 6, 15, 10, 0) })} />
        <button data-testid="rbc-select-event"
          onClick={() => props.onSelectEvent?.(EV)} />
        <button data-testid="rbc-drop"
          onClick={() => props.onEventDrop?.({ event: EV, start: new Date(2026, 6, 16, 11, 0), end: new Date(2026, 6, 16, 13, 0) })} />
        <button data-testid="rbc-resize"
          onClick={() => props.onEventResize?.({ event: EV, start: new Date(2026, 6, 15, 10, 0), end: new Date(2026, 6, 15, 13, 0) })} />
      </div>
    ),
    dateFnsLocalizer: () => ({}),
    Views: { MONTH: 'month', WEEK: 'week', DAY: 'day', AGENDA: 'agenda' },
  };
});
vi.mock('react-big-calendar/lib/css/react-big-calendar.css', () => ({}));
// El HOC de drag&drop se mockea como identidad → DnDCalendar === Calendar mock.
vi.mock('react-big-calendar/lib/addons/dragAndDrop', () => ({ default: (C: any) => C }));
vi.mock('react-big-calendar/lib/addons/dragAndDrop/styles.css', () => ({}));

// Modales stub: NewInstallation expone sus defaults; CompleteModal expone onDone.
vi.mock('@/components/installations/NewInstallationModal', () => ({
  NewInstallationModal: (p: any) =>
    <div data-testid="new-modal" data-fecha={p.defaultFecha} data-hora={p.defaultHora} />,
}));
vi.mock('@/components/installations/CompleteModal', () => ({
  CompleteModal: (p: any) => <button data-testid="complete-done" onClick={p.onDone} />,
}));
vi.mock('@/components/installations/CancelModal', () => ({ CancelModal: () => <div /> }));
vi.mock('@/components/installations/NoShowModal', () => ({ NoShowModal: () => <div /> }));
vi.mock('@/components/installations/AssignBoxModal', () => ({ AssignBoxModal: () => <div /> }));

vi.mock('@/services/installationService', () => ({
  getCalendarEvents: vi.fn(),
  getTicketCalendarVisits: vi.fn(),
  getTechnicians: vi.fn(),
  rescheduleInstallation: vi.fn(),
  STATUS_COLOR: { Pendiente: 'bg-blue-100 text-blue-800', NoRealizada: 'bg-orange-100 text-orange-800' },
  STATUS_LABEL: { Pendiente: 'Pendiente', Completada: 'Completada' },
}));
vi.mock('@/hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }));
// authStore como Admin → habilita el tablero por técnico (Fase 3).
vi.mock('@/store/authStore', () => ({
  useAuthStore: (sel: any) => sel({ role: 'Admin' }),
}));

const TECHS = [{ id: 't1', nombre: 'Juan Mamani' }, { id: 't2', nombre: 'Luis Choque' }];

const makeItem = (over: Partial<any> = {}): any => ({
  Id: 'i1', ClienteTbn: 'TBN-001', ClienteNombre: 'Ana Rosales',
  PlanNombre: 'Plan Fibra', Fecha: '2026-07-15', HoraInicio: '10:00',
  Status: 'Pendiente', TecnicoNombre: null, TicketId: null, CreadoAt: '2026-07-15',
  DuracionMin: 120, TecnicoId: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  (installationService.getCalendarEvents as any).mockResolvedValue([]);
  (installationService.getTicketCalendarVisits as any).mockResolvedValue([]);
  (installationService.getTechnicians as any).mockResolvedValue(TECHS);
  (installationService.rescheduleInstallation as any).mockResolvedValue(undefined);
});

describe('InstallationsCalendarPage — TC-CAL-F01, F05, F07, F08, F09', () => {
  it('TC-CAL-F01 — al montar pide getCalendarEvents con rango yyyy-MM-dd', async () => {
    render(<InstallationsCalendarPage />);
    await waitFor(() => expect(installationService.getCalendarEvents).toHaveBeenCalled());
    const [desde, hasta] = (installationService.getCalendarEvents as any).mock.calls[0];
    expect(desde).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(hasta).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(desde <= hasta).toBe(true);
  });

  it('TC-CAL-F05 — error del backend muestra el mensaje', async () => {
    (installationService.getCalendarEvents as any).mockRejectedValueOnce(new Error('boom'));
    render(<InstallationsCalendarPage />);
    expect(await screen.findByText('No se pudo cargar el calendario.')).toBeInTheDocument();
  });

  it('TC-CAL-F07 — clic en hueco abre el modal de crear con la fecha', async () => {
    render(<InstallationsCalendarPage />);
    await waitFor(() => expect(installationService.getCalendarEvents).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('rbc-select-slot'));
    const modal = await screen.findByTestId('new-modal');
    expect(modal.getAttribute('data-fecha')).toBe('2026-07-15');
  });

  it('TC-CAL-F08 — clic en cita pendiente muestra acciones', async () => {
    render(<InstallationsCalendarPage />);
    await waitFor(() => expect(installationService.getCalendarEvents).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('rbc-select-event'));
    expect(await screen.findByText('Completar')).toBeInTheDocument();
    expect(screen.getByText('No realizada')).toBeInTheDocument();
    expect(screen.getByText('Cancelar')).toBeInTheDocument();
  });

  it('TC-CAL-F09 — acción exitosa refresca el calendario', async () => {
    render(<InstallationsCalendarPage />);
    await waitFor(() => expect(installationService.getCalendarEvents).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId('rbc-select-event'));
    fireEvent.click(await screen.findByText('Completar'));
    fireEvent.click(await screen.findByTestId('complete-done'));  // onDone del modal
    await waitFor(() =>
      expect((installationService.getCalendarEvents as any).mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('TC-CAL-F11 — filtrar por técnico vuelve a pedir el rango con tecnicoId', async () => {
    render(<InstallationsCalendarPage />);
    await waitFor(() => expect(installationService.getTechnicians).toHaveBeenCalled());
    // Activar "Ver por técnico"
    fireEvent.click(screen.getByRole('checkbox'));
    // El primer combobox es el de técnicos
    const techSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(techSelect, { target: { value: 't2' } });
    await waitFor(() => {
      const calls = (installationService.getCalendarEvents as any).mock.calls;
      expect(calls.some((c: any[]) => c[2] === 't2')).toBe(true);
    });
  });

  it('TC-CAL-F13 — arrastrar a franja válida llama a reprogramar', async () => {
    render(<InstallationsCalendarPage />);
    await waitFor(() => expect(installationService.getCalendarEvents).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('rbc-drop'));
    await waitFor(() => expect(installationService.rescheduleInstallation).toHaveBeenCalledWith(
      'i1', { Fecha: '2026-07-16', HoraInicio: '11:00' }));
  });

  it('TC-CAL-F14 — si el backend rechaza, muestra error (revierte)', async () => {
    (installationService.rescheduleInstallation as any).mockRejectedValueOnce(new Error('sin capacidad'));
    render(<InstallationsCalendarPage />);
    await waitFor(() => expect(installationService.getCalendarEvents).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('rbc-drop'));
    expect(await screen.findByText(/No se pudo reprogramar/)).toBeInTheDocument();
  });

  it('TC-CAL-F15 — redimensionar reprograma con la nueva duración', async () => {
    render(<InstallationsCalendarPage />);
    await waitFor(() => expect(installationService.getCalendarEvents).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('rbc-resize'));
    await waitFor(() => expect(installationService.rescheduleInstallation).toHaveBeenCalledWith(
      'i1', { Fecha: '2026-07-15', HoraInicio: '10:00', DuracionMin: 180 }));
  });
});

describe('calendarEvents (funciones puras) — TC-CAL-F02, F03, F04, F07b, F08b', () => {
  it('TC-CAL-F02 — construye start/end desde componentes sin desfase de zona', () => {
    const start = buildEventStart('2026-07-15', '10:00');
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(6);
    expect(start.getDate()).toBe(15);
    expect(start.getHours()).toBe(10);

    const ev = toCalendarEvent(makeItem({ HoraInicio: '10:00', DuracionMin: 90 }));
    expect(ev.title).toContain('Ana Rosales');
    expect(ev.start.getHours()).toBe(10);
    expect((ev.end.getTime() - ev.start.getTime()) / 60000).toBe(90);
  });

  it('TC-CAL-F02b — duración nula usa 120 min por defecto', () => {
    const start = buildEventStart('2026-07-15', '08:00');
    expect((buildEventEnd(start, null).getTime() - start.getTime()) / 60000).toBe(120);
  });

  it('TC-CAL-F03 — visibleRange normaliza array y {start,end}', () => {
    const arr = [new Date(2026, 6, 10), new Date(2026, 6, 3), new Date(2026, 6, 20)];
    expect(visibleRange(arr)).toEqual({ desde: '2026-07-03', hasta: '2026-07-20' });
    const obj = { start: new Date(2026, 6, 6), end: new Date(2026, 6, 12) };
    expect(visibleRange(obj)).toEqual({ desde: '2026-07-06', hasta: '2026-07-12' });
  });

  it('TC-CAL-F04 — toIsoDate formatea fecha local sin tocar zona', () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toIsoDate(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('TC-CAL-F07b — slotToDefaults: mes sin hora, semana con hora', () => {
    expect(slotToDefaults(new Date(2026, 6, 15, 10, 30), true)).toEqual({ fecha: '2026-07-15', hora: '' });
    expect(slotToDefaults(new Date(2026, 6, 15, 10, 30), false)).toEqual({ fecha: '2026-07-15', hora: '10:30' });
  });

  it('TC-CAL-F08b — actionsForStatus por estado', () => {
    expect(actionsForStatus('Pendiente')).toEqual(['complete', 'noshow', 'cancel']);
    expect(actionsForStatus('EnProceso')).toEqual(['complete', 'noshow', 'cancel']);
    expect(actionsForStatus('Completada')).toEqual(['assignBox']);
    expect(actionsForStatus('Cancelada')).toEqual([]);
    expect(actionsForStatus('NoRealizada')).toEqual([]);
  });

  it('TC-CAL-F10 — cada evento cae en la columna de su técnico', () => {
    const techs = [{ id: 't1', nombre: 'Juan' }, { id: 't2', nombre: 'Luis' }];
    const cols = buildResources(techs);
    expect(cols.map(c => c.resourceId)).toEqual(['t1', 't2', SIN_ASIGNAR]);

    expect(toCalendarEvent(makeItem({ TecnicoId: 't1' })).resourceId).toBe('t1');
    expect(toCalendarEvent(makeItem({ TecnicoId: 't2' })).resourceId).toBe('t2');

    // Con un técnico filtrado → una sola columna
    expect(buildResources(techs, 't2')).toEqual([{ resourceId: 't2', resourceTitle: 'Luis' }]);
  });

  it('TC-CAL-F12 — evento sin técnico va a "Sin asignar" y filtro por estado', () => {
    expect(toCalendarEvent(makeItem({ TecnicoId: null })).resourceId).toBe(SIN_ASIGNAR);
    const cols = buildResources([{ id: 't1', nombre: 'Juan' }]);
    expect(cols.some(c => c.resourceId === SIN_ASIGNAR && c.resourceTitle === 'Sin asignar')).toBe(true);

    const evs = [
      toCalendarEvent(makeItem({ Id: 'a', Status: 'Pendiente' })),
      toCalendarEvent(makeItem({ Id: 'b', Status: 'Completada' })),
    ];
    expect(filterByStatus(evs, 'Completada').map(e => e.id)).toEqual(['b']);
    expect(filterByStatus(evs, '').length).toBe(2);
  });

  it('TC-CAL-F13b — isDraggableStatus y durationMinutes', () => {
    expect(isDraggableStatus('Pendiente')).toBe(true);
    expect(isDraggableStatus('EnProceso')).toBe(true);
    expect(isDraggableStatus('Completada')).toBe(false);
    expect(isDraggableStatus('Cancelada')).toBe(false);
    expect(isDraggableStatus('NoRealizada')).toBe(false);
    expect(durationMinutes(new Date(2026, 6, 15, 10, 0), new Date(2026, 6, 15, 13, 0))).toBe(180);
  });
});
