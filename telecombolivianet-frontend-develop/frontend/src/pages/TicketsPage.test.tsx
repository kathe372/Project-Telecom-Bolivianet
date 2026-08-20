import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TicketsPage from './TicketsPage';
import { ticketService } from '@/services/ticketService';
import { userService } from '@/services/userService';

vi.mock('@/services/ticketService', () => ({
  ticketService: {
    getAll:        vi.fn(),
    getKpi:        vi.fn(),
    getKanban:     vi.fn(),
    getSlaAlerts:  vi.fn(),
    getById:       vi.fn(),
  },
}));

vi.mock('@/services/userService', () => ({
  userService: { getAll: vi.fn() },
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (s: { isAdmin: () => boolean }) => unknown) =>
    selector({ isAdmin: () => true }),
}));

vi.mock('@/store/ticketStore', () => ({
  useTicketStore: (selector: (s: { setSlaBreachedCount: () => void }) => unknown) =>
    selector({ setSlaBreachedCount: vi.fn() }),
}));

vi.mock('@/hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }));

vi.mock('@/components/tickets/TicketDetailModal', () => ({
  TicketDetailModal: () => <div data-testid="ticket-detail-modal" />,
}));

vi.mock('@/components/tickets/CreateTicketModal', () => ({
  CreateTicketModal: () => <div data-testid="create-ticket-modal" />,
}));

const makeTicket = (over: Partial<Record<string, unknown>> = {}) => ({
  Id: 't1', TicketNumber: 'TKT-001', Subject: 'Sin internet',
  Description: 'El cliente reporta caída total', ClientName: 'Ana Rosales', ClientTbn: 'TBN-0001',
  Type: 'SoporteTecnico', Status: 'Abierto', Priority: 'Alta',
  CreatedAt: new Date().toISOString(), DueDate: null, SlaDeadline: null,
  ResolvedAt: null, SlaCompliant: null, AssignedToName: null, AutoAssigned: false,
  ...over,
});

const KPI = {
  TotalOpen: 3, TotalInProcess: 2, TotalResolved: 5, TotalClosed: 10,
  OverdueSla: 1, CreatedToday: 4,
  SlaCompliantCount: 8, SlaBreachedCount: 1, SlaByPriority: [],
  AvgResolutionMinutes: null, AvgFirstResponseMinutes: null,
};

const paged = (items: unknown[]) => ({
  Items: items, TotalCount: items.length, PageNumber: 1, PageSize: 20,
});

beforeEach(() => {
  vi.clearAllMocks();
  (ticketService.getAll as ReturnType<typeof vi.fn>).mockResolvedValue(paged([makeTicket()]));
  (ticketService.getKpi as ReturnType<typeof vi.fn>).mockResolvedValue(KPI);
  (ticketService.getKanban as ReturnType<typeof vi.fn>).mockResolvedValue({
    Abierto: [makeTicket()], EnProceso: [], EnVisita: [],
    PendienteCliente: [], Resuelto: [], Cerrado: [],
  });
  (ticketService.getSlaAlerts as ReturnType<typeof vi.fn>).mockResolvedValue({ Breached: [] });
  (ticketService.getById as ReturnType<typeof vi.fn>).mockResolvedValue(makeTicket());
  (userService.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ Items: [] });
});

describe('TicketsPage — TC-FE-TKT-01 a TC-FE-TKT-07 (red de seguridad refactor #6)', () => {
  it('TC-FE-TKT-01 — carga lista con ticket, total y KPIs', async () => {
    render(<TicketsPage />);
    expect(await screen.findByText('Sin internet')).toBeInTheDocument();
    expect(screen.getByText('TBN-0001')).toBeInTheDocument();
    expect(screen.getByText(/1 tickets en total/)).toBeInTheDocument();
    expect(screen.getByText('Abiertos')).toBeInTheDocument(); // KpiCards
  });

  it('TC-FE-TKT-02 — muestra error si la carga falla', async () => {
    (ticketService.getAll as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('500'));
    render(<TicketsPage />);
    expect(await screen.findByText(/Error al cargar los tickets/)).toBeInTheDocument();
  });

  it('TC-FE-TKT-03 — lista vacía muestra estado sin resultados', async () => {
    (ticketService.getAll as ReturnType<typeof vi.fn>).mockResolvedValue(paged([]));
    render(<TicketsPage />);
    expect(await screen.findByText('No se encontraron tickets.')).toBeInTheDocument();
  });

  it('TC-FE-TKT-04 — cambiar a Kanban carga y muestra columnas', async () => {
    render(<TicketsPage />);
    await screen.findByText('Sin internet');
    fireEvent.click(screen.getByRole('button', { name: /Kanban/ }));
    await waitFor(() => expect(ticketService.getKanban).toHaveBeenCalled());
    // "Sin tickets" solo aparece en columnas kanban vacías → señal única de la vista kanban
    expect((await screen.findAllByText('Sin tickets')).length).toBeGreaterThan(0);
  });

  it('TC-FE-TKT-05 — filtrar por estado recarga con el filtro', async () => {
    render(<TicketsPage />);
    await screen.findByText('Sin internet');
    fireEvent.change(screen.getByDisplayValue('Todos los estados'), { target: { value: 'Resuelto' } });
    await waitFor(() =>
      expect(ticketService.getAll).toHaveBeenLastCalledWith(expect.objectContaining({ Status: 'Resuelto' })));
  });

  it('TC-FE-TKT-06 — click en fila abre el detalle (getById + modal)', async () => {
    render(<TicketsPage />);
    fireEvent.click(await screen.findByText('Sin internet'));
    await waitFor(() => expect(ticketService.getById).toHaveBeenCalledWith('t1'));
    expect(await screen.findByTestId('ticket-detail-modal')).toBeInTheDocument();
  });

  it('TC-FE-TKT-07 — abre el modal de nuevo ticket', async () => {
    render(<TicketsPage />);
    await screen.findByText('Sin internet');
    fireEvent.click(screen.getByRole('button', { name: /Nuevo Ticket/ }));
    expect(await screen.findByTestId('create-ticket-modal')).toBeInTheDocument();
  });
});
