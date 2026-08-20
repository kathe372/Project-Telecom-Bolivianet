import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TicketDetailModal } from './TicketDetailModal';
import { ticketService } from '@/services/ticketService';
import { cannedResponseService } from '@/services/cannedResponseService';

vi.mock('@/services/ticketService', () => ({
  ticketService: {
    getById:       vi.fn(),
    getActivity:   vi.fn(),
    changeStatus:  vi.fn(),
    close:         vi.fn(),
    assign:        vi.fn(),
    addComment:    vi.fn(),
    scheduleVisit: vi.fn(),
  },
}));

vi.mock('@/services/cannedResponseService', () => ({
  cannedResponseService: { getAll: vi.fn() },
}));

vi.mock('./SlaProgressBar', () => ({ SlaProgressBar: () => <div data-testid="sla-bar" /> }));
vi.mock('./TicketAttachmentsTab', () => ({ TicketAttachmentsTab: () => <div data-testid="attachments-tab" /> }));

const makeDetail = (over: Partial<Record<string, unknown>> = {}) => ({
  Id: 't1', Subject: 'Sin internet', Description: 'Caída total del servicio',
  Status: 'Abierto', Priority: 'Alta', SupportGroup: null,
  ClientName: 'Ana Rosales', ClientTbn: 'TBN-0001', TicketNumber: 'TKT-001',
  ClientId: 'c1', ClientZone: 'Sacaba', ClientStreet: null, ClientLocationRef: null,
  ClientPhone: '71435981', ClientPlanName: 'Fibra 50',
  ClientGpsLatitude: null, ClientGpsLongitude: null,
  Type: 'SoporteTecnico', Origin: 'WhatsApp', CreatedByName: 'Bot',
  CreatedAt: new Date().toISOString(), DueDate: null, FirstRespondedAt: null,
  ResolvedAt: null, ClosedAt: null, TotalWorkMinutes: 0, SlaCompliant: null,
  SlaDeadline: null, SlaPausedAt: null, SlaTotalPausedMinutes: 0,
  ResolutionMessage: null, RootCause: null,
  AssignedToUserId: null, AssignedToName: null, WhatsAppWarning: null, ImageUrl: null,
  Comments: [
    { Id: 'cm1', Type: 'NotaInterna', Body: 'Revisando el nodo', AuthorName: 'Tec. Juan', CreatedAt: new Date().toISOString() },
  ],
  WorkLogs: [
    { Id: 'wl1', TotalMinutes: 45, UserName: 'Tec. Juan', Notes: 'Diagnóstico', LoggedAt: new Date().toISOString() },
  ],
  Visits: [
    { Id: 'v1', ScheduledAt: new Date().toISOString(), Status: 'Programada', TechnicianName: 'Tec. Juan', Observations: 'Llevar ONU' },
  ],
  ...over,
});

const TECHS = [{ Id: 'u1', FullName: 'Tec. Juan', Role: 'Tecnico' }];

beforeEach(() => {
  vi.clearAllMocks();
  (ticketService.getById as ReturnType<typeof vi.fn>).mockResolvedValue(makeDetail());
  (ticketService.getActivity as ReturnType<typeof vi.fn>).mockResolvedValue([
    { Id: 'a1', Action: 'CREATED', UserName: 'Bot', Description: 'Ticket creado', Timestamp: new Date().toISOString() },
  ]);
  (ticketService.addComment as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (cannedResponseService.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([]);
});

function renderModal(detail = makeDetail()) {
  return render(
    <TicketDetailModal
      ticket={detail as never}
      technicians={TECHS as never}
      isAdmin
      onClose={vi.fn()}
      onRefresh={vi.fn()}
    />,
  );
}

describe('TicketDetailModal — TC-FE-TKD-01 a TC-FE-TKD-06 (red de seguridad refactor #6b)', () => {
  it('TC-FE-TKD-01 — pestaña Información: asunto, descripción y datos', () => {
    renderModal();
    expect(screen.getByText('Sin internet')).toBeInTheDocument();
    expect(screen.getByText('Caída total del servicio')).toBeInTheDocument();
    expect(screen.getByText('TKT-001')).toBeInTheDocument();
    expect(screen.getByText('Técnico asignado')).toBeInTheDocument(); // bloque admin
  });

  it('TC-FE-TKD-02 — pestaña Notas lista comentarios y formulario', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Notas/ }));
    expect(screen.getByText('Revisando el nodo')).toBeInTheDocument();
    expect(screen.getByText('Agregar nota / respuesta')).toBeInTheDocument();
  });

  it('TC-FE-TKD-04 — pestaña Visitas lista visitas y formulario', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Visitas/ }));
    expect(screen.getByText('Llevar ONU')).toBeInTheDocument();
    expect(screen.getByText('Programar visita técnica')).toBeInTheDocument();
  });

  it('TC-FE-TKD-05 — pestaña Historial carga actividad', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Historial/ }));
    await waitFor(() => expect(ticketService.getActivity).toHaveBeenCalledWith('t1'));
    expect(await screen.findByText('Ticket creado')).toBeInTheDocument();
  });

  it('TC-FE-TKD-06 — agregar comentario llama al servicio', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Notas/ }));
    fireEvent.change(screen.getByPlaceholderText(/Nota interna del equipo/), {
      target: { value: 'Escalado a redes' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(ticketService.addComment).toHaveBeenCalledWith('t1', {
      Type: 'NotaInterna', Body: 'Escalado a redes',
    }));
  });
});
