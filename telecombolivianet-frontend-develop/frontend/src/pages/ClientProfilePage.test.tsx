import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ClientProfilePage from './ClientProfilePage';
import { clientService, getClientHistorial, getAttachments } from '@/services/clientService';
import { ticketService } from '@/services/ticketService';
import { chatbotService } from '@/services/chatbotService';

vi.mock('@/services/clientService', () => ({
  clientService: {
    getById:     vi.fn(),
    getInvoices: vi.fn(),
    getQrInfo:   vi.fn(),
    uploadQr:    vi.fn(),
    suspend:     vi.fn(),
    reactivate:  vi.fn(),
    cancel:      vi.fn(),
  },
  planService:       { getAll: vi.fn().mockResolvedValue([]) },
  planChangeService: {
    getPending:   vi.fn().mockResolvedValue([]),
    getHistorial: vi.fn().mockResolvedValue([]),
    request:      vi.fn(),
    approve:      vi.fn(),
    reject:       vi.fn(),
  },
  getAttachments:     vi.fn().mockResolvedValue([]),
  uploadAttachment:   vi.fn(),
  deleteAttachment:   vi.fn(),
  downloadAttachment: vi.fn(),
  getClientHistorial: vi.fn().mockResolvedValue({ Total: 0, Items: [] }),
  TIPO_DOC_LABELS: { Otro: 'Otro' },
  TIPO_DOC_ICONS:  { Otro: '📎' },
}));

vi.mock('@/services/paymentService', () => ({
  paymentService: { voidPayment: vi.fn(), uploadReceiptImage: vi.fn() },
}));

vi.mock('@/services/ticketService', () => ({
  ticketService: { getByClient: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/services/userService', () => ({
  userService: { getAll: vi.fn().mockResolvedValue({ Items: [] }) },
}));

vi.mock('@/services/chatbotService', () => ({
  chatbotService: {
    getClientHistory: vi.fn().mockResolvedValue({ Conversaciones: [] }),
    getConversacion:  vi.fn().mockResolvedValue({ Messages: [] }),
  },
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (s: { isAdmin: () => boolean }) => unknown) =>
    selector({ isAdmin: () => true }),
}));

vi.mock('@/hooks/useTicketModal', () => ({
  useTicketModal: () => ({
    ticket: null, loading: false,
    openTicket: vi.fn(), closeTicket: vi.fn(), refreshTicket: vi.fn(),
  }),
}));

vi.mock('@/hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }));

vi.mock('@/components/clients/PaymentModal', () => ({
  PaymentModal: () => <div data-testid="payment-modal" />,
}));

vi.mock('@/components/tickets/TicketDetailModal', () => ({
  TicketDetailModal: () => <div data-testid="ticket-detail-modal" />,
}));

const CLIENT = {
  Id: 'c1', FullName: 'Ana Rosales', TbnCode: 'TBN-0001',
  IdentityCard: '1234567', PhoneMain: '71435981', PhoneSecondary: null,
  Status: 'Activo', Zone: 'Sacaba', Street: 'Calle 1 #23', LocationRef: null,
  GpsLatitude: null, GpsLongitude: null,
  Plan: { Id: 'p1', Name: 'Fibra 50', DisplayLabel: 'Fibra 50 — 50 Mb' },
  HasTvCable: false, WinboxNumber: null, OnuSerialNumber: null,
  InstallationDate: '2026-01-15', InstalledByName: 'Tec. Juan',
  CajaNap: null, TotalDebt: 350, PendingMonths: 2,
  LastPaymentDate: '2026-06-01', InstallationPaid: true,
  CreatedAt: '2026-01-15', CreditBalance: 0,
};

const GRID = {
  Invoices: [{
    Id: 'inv1', Month: 7, Year: new Date().getFullYear(),
    Type: 'Mensualidad', Status: 'Pendiente', Amount: 150, Notes: null,
  }],
  Payments: [{
    Id: 'pay1', Amount: 150, Method: 'Efectivo', Bank: null,
    PaidAt: '2026-06-01', RegisteredAt: '2026-06-01',
    RegisteredByName: 'Admin', FromWhatsApp: false,
    IsVoided: false, CanVoid: true, CoveredMonths: ['Jun 2026'],
    ReceiptImageUrl: null, BankReference: null, PhysicalReceiptNumber: null,
  }],
  TotalDebt: 150, PendingMonths: 1, LastPaymentDate: '2026-06-01',
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/clients/c1']}>
      <Routes>
        <Route path="/clients/:id" element={<ClientProfilePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function renderAndWait() {
  renderPage();
  expect(await screen.findByRole('heading', { name: 'Ana Rosales' })).toBeInTheDocument();
}

beforeEach(() => {
  vi.clearAllMocks();
  (clientService.getById as ReturnType<typeof vi.fn>).mockResolvedValue(CLIENT);
  (clientService.getInvoices as ReturnType<typeof vi.fn>).mockResolvedValue(GRID);
  (getClientHistorial as ReturnType<typeof vi.fn>).mockResolvedValue({ Total: 0, Items: [] });
  (getAttachments as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (ticketService.getByClient as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (chatbotService.getClientHistory as ReturnType<typeof vi.fn>).mockResolvedValue({ Conversaciones: [] });
});

describe('ClientProfilePage — TC-FE-PROF-01 a TC-FE-PROF-09 (red de seguridad refactor B)', () => {
  it('TC-FE-PROF-01 — carga y muestra cabecera con nombre, TBN y pestaña Información', async () => {
    await renderAndWait();
    expect(screen.getByText('TBN-0001')).toBeInTheDocument();
    expect(screen.getByText('Datos personales')).toBeInTheDocument();
    expect(screen.getByText('Carnet identidad')).toBeInTheDocument();
    expect(screen.getByText('Tec. Juan')).toBeInTheDocument();
  });

  it('TC-FE-PROF-02 — muestra estado de error si el cliente no carga', async () => {
    (clientService.getById as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('500'));
    renderPage();
    expect(await screen.findByText('No se pudo cargar el perfil del cliente.')).toBeInTheDocument();
  });

  it('TC-FE-PROF-03 — muestra la deuda del cliente en la cabecera', async () => {
    await renderAndWait();
    expect(screen.getByText(/Deuda: Bs\./)).toBeInTheDocument();
    expect(screen.getByText(/2 meses/)).toBeInTheDocument();
  });

  it('TC-FE-PROF-04 — pestaña Facturación carga la grilla y el historial de pagos', async () => {
    await renderAndWait();
    fireEvent.click(screen.getByRole('button', { name: /Facturación/ }));
    await waitFor(() => expect(clientService.getInvoices).toHaveBeenCalledWith('c1', new Date().getFullYear()));
    expect(await screen.findByText('Facturas por mes')).toBeInTheDocument();
    expect(screen.getByText(/Historial de pagos/)).toBeInTheDocument();
    expect(await screen.findByText('Efectivo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Registrar pago/ })).toBeInTheDocument();
  });

  it('TC-FE-PROF-05 — pestaña Cambio de plan muestra el plan actual', async () => {
    await renderAndWait();
    fireEvent.click(screen.getByRole('button', { name: /Cambio de plan/ }));
    expect(await screen.findByText('Plan actual')).toBeInTheDocument();
    expect(screen.getByText('Fibra 50')).toBeInTheDocument();
  });

  it('TC-FE-PROF-06 — pestaña Tickets muestra vacío cuando no hay tickets', async () => {
    await renderAndWait();
    fireEvent.click(screen.getByRole('button', { name: /Tickets/ }));
    expect(await screen.findByText('Este cliente no tiene tickets registrados.')).toBeInTheDocument();
  });

  it('TC-FE-PROF-07 — pestaña Documentos muestra formulario de subida y vacío', async () => {
    await renderAndWait();
    fireEvent.click(screen.getByRole('button', { name: /Documentos/ }));
    expect(await screen.findByText('Subir documento')).toBeInTheDocument();
    expect(screen.getByText('No hay documentos adjuntos para este cliente.')).toBeInTheDocument();
  });

  it('TC-FE-PROF-08 — pestaña Historial muestra filtros y estado vacío', async () => {
    await renderAndWait();
    fireEvent.click(screen.getByRole('button', { name: /^Historial$/ }));
    expect(await screen.findByText(/No hay actividad registrada/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pagos' })).toBeInTheDocument();
  });

  it('TC-FE-PROF-09 — pestaña Mensajes muestra vacío sin conversaciones y acciones admin visibles', async () => {
    await renderAndWait();
    expect(screen.getByRole('button', { name: /Suspender/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Mensajes/ }));
    expect(await screen.findByText('Este cliente no tiene conversaciones registradas por WhatsApp.')).toBeInTheDocument();
  });
});
