import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InstallationsPage from './InstallationsPage';
import {
  getInstallations, markInstallationNoShow, assignInstallationBox,
} from '@/services/installationService';
import { coverageService } from '@/services/coverageService';

vi.mock('@/services/installationService', () => ({
  getInstallations:       vi.fn(),
  cancelInstallation:     vi.fn(),
  completeInstallation:   vi.fn(),
  createInstallation:     vi.fn(),
  assignInstallationBox:  vi.fn(),
  markInstallationNoShow: vi.fn(),
  STATUS_LABEL: {
    Pendiente: 'Pendiente', EnProceso: 'En proceso', Completada: 'Completada',
    Cancelada: 'Cancelada', Reprogramada: 'Reprogramada', NoRealizada: 'No realizada',
  },
  STATUS_COLOR: {
    Pendiente: 'bg-blue-100 text-blue-800', EnProceso: 'bg-amber-100 text-amber-800',
    Completada: 'bg-green-100 text-green-800', Cancelada: 'bg-red-100 text-red-700',
    Reprogramada: 'bg-purple-100 text-purple-800', NoRealizada: 'bg-orange-100 text-orange-800',
  },
}));

vi.mock('@/services/clientService', () => ({
  planService:   { getAll: vi.fn().mockResolvedValue([]) },
  searchClients: vi.fn().mockResolvedValue({ Items: [] }),
}));

vi.mock('@/services/coverageService', () => ({
  coverageService: { getAllBoxes: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }));

const makeInst = (over: Partial<Record<string, unknown>> = {}) => ({
  Id: 'i1', ClienteNombre: 'Ana Rosales', ClienteTbn: 'TBN-0001',
  PlanNombre: 'Fibra 50', Fecha: '2026-07-10', HoraInicio: '09:00',
  Status: 'Pendiente', TecnicoNombre: null, BoxCodigo: null,
  ...over,
});

const PAGED = (items: unknown[]) => ({
  Items: items, TotalCount: items.length, PageNumber: 1, PageSize: 20, TotalPages: 1,
});

beforeEach(() => {
  vi.clearAllMocks();
  (getInstallations as ReturnType<typeof vi.fn>).mockResolvedValue(PAGED([makeInst()]));
  (coverageService.getAllBoxes as ReturnType<typeof vi.fn>).mockResolvedValue([
    { id: 'b1', codigo: 'NAP-01', zoneName: 'Sacaba', puertosLibres: 4, estado: 'Activo' },
  ]);
  (markInstallationNoShow as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (assignInstallationBox as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
});

describe('InstallationsPage — TC-FE-INST-01 a TC-FE-INST-07 (red de seguridad refactor C2)', () => {
  it('TC-FE-INST-01 — lista instalaciones con cliente, plan y estado', async () => {
    render(<MemoryRouter><InstallationsPage /></MemoryRouter>);
    expect(await screen.findByText('Ana Rosales')).toBeInTheDocument();
    expect(screen.getByText('TBN-0001')).toBeInTheDocument();
    expect(screen.getByText('Fibra 50')).toBeInTheDocument();
    expect(screen.getByText(/1 en total/)).toBeInTheDocument();
  });

  it('TC-FE-INST-02 — muestra error si la carga falla', async () => {
    (getInstallations as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('500'));
    render(<MemoryRouter><InstallationsPage /></MemoryRouter>);
    expect(await screen.findByText('No se pudo cargar la lista de instalaciones.')).toBeInTheDocument();
  });

  it('TC-FE-INST-03 — muestra estado vacío sin resultados', async () => {
    (getInstallations as ReturnType<typeof vi.fn>).mockResolvedValue(PAGED([]));
    render(<MemoryRouter><InstallationsPage /></MemoryRouter>);
    expect(await screen.findByText('No hay instalaciones que coincidan con los filtros.')).toBeInTheDocument();
  });

  it('TC-FE-INST-04 — filtrar por estado recarga con el filtro aplicado', async () => {
    render(<MemoryRouter><InstallationsPage /></MemoryRouter>);
    await screen.findByText('Ana Rosales');
    fireEvent.change(screen.getByDisplayValue('Todos los estados'), { target: { value: 'Pendiente' } });
    await waitFor(() =>
      expect(getInstallations).toHaveBeenLastCalledWith({ page: 1, pageSize: 20, status: 'Pendiente' }));
  });

  it('TC-FE-INST-05 — abre el modal de nueva instalación', async () => {
    render(<MemoryRouter><InstallationsPage /></MemoryRouter>);
    await screen.findByText('Ana Rosales');
    fireEvent.click(screen.getByRole('button', { name: /Nueva instalación/ }));
    expect(await screen.findByText('Nueva instalación', { selector: 'h3' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Buscar por nombre o TBN...')).toBeInTheDocument();
  });

  it('TC-FE-INST-06 — flujo "no realizada": registra motivo, llama al servicio y CIERRA el modal', async () => {
    render(<MemoryRouter><InstallationsPage /></MemoryRouter>);
    await screen.findByText('Ana Rosales');
    fireEvent.click(screen.getByTitle('No se pudo realizar (cliente ausente, etc.)'));
    expect(await screen.findByText('Instalación no realizada')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/cliente ausente, domicilio inaccesible/), {
      target: { value: 'Cliente ausente' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Registrar no realizada/ }));

    await waitFor(() => expect(markInstallationNoShow).toHaveBeenCalledWith('i1', 'Cliente ausente'));
    // El modal debe cerrarse tras registrar (bug detectado en auditoría: handleDone no limpiaba noShowTarget)
    await waitFor(() =>
      expect(screen.queryByText('Instalación no realizada')).not.toBeInTheDocument());
  });

  it('TC-FE-INST-07 — abre modal de cancelación con datos de la instalación', async () => {
    render(<MemoryRouter><InstallationsPage /></MemoryRouter>);
    await screen.findByText('Ana Rosales');
    fireEvent.click(screen.getByTitle('Cancelar instalación'));
    expect(await screen.findByText('Cancelar instalación', { selector: 'h3' })).toBeInTheDocument();
    expect(screen.getByText(/Ana Rosales — 2026-07-10 09:00/)).toBeInTheDocument();
  });
});
