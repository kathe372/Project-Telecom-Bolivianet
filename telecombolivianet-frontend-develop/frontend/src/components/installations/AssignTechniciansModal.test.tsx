import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AssignTechniciansModal from './AssignTechniciansModal';
import * as installationService from '@/services/installationService';
import * as userService from '@/services/userService';

vi.mock('@/services/installationService', () => ({
  assignTechnicians: vi.fn(),
}));

vi.mock('@/services/userService', () => ({
  userService: {
    getAll: vi.fn(),
  },
}));

const TECHNICIANS = [
  { Id: 'tec-1', FullName: 'Juan Pérez',    Role: 'Tecnico', Status: 'Activo' },
  { Id: 'tec-2', FullName: 'María García',  Role: 'Tecnico', Status: 'Activo' },
];

const defaultProps = {
  instalacionId:    'inst-abc',
  instalacionLabel: 'Instalación — 2026-06-10 09:00',
  onClose: vi.fn(),
  onDone:  vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  (userService.userService.getAll as any).mockResolvedValue({ Items: TECHNICIANS, TotalCount: 2 });
});

describe('AsignarTecnicosModal — TC-FE-01 a TC-FE-06', () => {
  it('TC-FE-01 — muestra la lista de técnicos cargados del servicio', async () => {
    render(<AssignTechniciansModal {...defaultProps} />);
    expect(await screen.findByText('Juan Pérez')).toBeInTheDocument();
    expect(screen.getByText('María García')).toBeInTheDocument();
  });

  it('TC-FE-02 — seleccionar un técnico activa su checkbox y muestra contador', async () => {
    render(<AssignTechniciansModal {...defaultProps} />);
    await screen.findByText('Juan Pérez');
    fireEvent.click(screen.getByText('Juan Pérez').closest('[class*="cursor"]')!);
    expect(await screen.findByText(/1 técnico seleccionado/)).toBeInTheDocument();
  });

  it('TC-FE-03 — enviar sin seleccionar técnico muestra error de validación', async () => {
    render(<AssignTechniciansModal {...defaultProps} />);
    await screen.findByText('Juan Pérez');
    fireEvent.click(screen.getByRole('button', { name: /Asignar/ }));
    expect(await screen.findByText(/Selecciona al menos un técnico/)).toBeInTheDocument();
    expect(installationService.assignTechnicians).not.toHaveBeenCalled();
  });

  it('TC-FE-04 — éxito llama asignarTecnicos con los IDs correctos y dispara onDone', async () => {
    (installationService.assignTechnicians as any).mockResolvedValue(undefined);
    render(<AssignTechniciansModal {...defaultProps} />);
    await screen.findByText('Juan Pérez');
    fireEvent.click(screen.getByText('Juan Pérez').closest('[class*="cursor"]')!);
    fireEvent.click(screen.getByRole('button', { name: /Asignar/ }));
    await waitFor(() => {
      expect(installationService.assignTechnicians).toHaveBeenCalledWith(
        'inst-abc', ['tec-1'], 'tec-1',
      );
      expect(defaultProps.onDone).toHaveBeenCalled();
    });
  });

  it('TC-FE-05 — error del servicio muestra mensaje de error', async () => {
    (installationService.assignTechnicians as any).mockRejectedValue(new Error('server error'));
    render(<AssignTechniciansModal {...defaultProps} />);
    await screen.findByText('Juan Pérez');
    fireEvent.click(screen.getByText('Juan Pérez').closest('[class*="cursor"]')!);
    fireEvent.click(screen.getByRole('button', { name: /Asignar/ }));
    expect(await screen.findByText(/Error al asignar/)).toBeInTheDocument();
    expect(defaultProps.onDone).not.toHaveBeenCalled();
  });

  it('TC-FE-06 — botón Cancelar llama onClose', async () => {
    render(<AssignTechniciansModal {...defaultProps} />);
    await screen.findByText('Juan Pérez');
    fireEvent.click(screen.getByRole('button', { name: /Cancelar/ }));
    expect(defaultProps.onClose).toHaveBeenCalledOnce();
  });
});
