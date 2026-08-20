import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/services/coverageService', () => ({
  coverageService: { getBoxPorts: vi.fn(), damagePort: vi.fn(), repairPort: vi.fn() },
}));
import { coverageService } from '@/services/coverageService';
import BoxPortsModal from './BoxPortsModal';
import type { DistributionBox, NapPort } from '@/types/coverage';

const box: DistributionBox = {
  id: 'b1', codigo: 'NAP-014', direccionReferencia: '', zoneId: 'z', zoneName: 'Z',
  lat: 0, lng: 0, puertosTotal: 4, puertosOcupados: 0, puertosReservados: 0, puertosLibres: 4, estado: 'Activo',
};
const ports: NapPort[] = [
  { numero: 1, status: 'Free', updatedAt: '' },
  { numero: 2, status: 'Used', onuSerial: 'HWTC 1', accountId: 'a', updatedAt: '' },
];

describe('BoxPortsModal', () => {
  beforeEach(() => { vi.clearAllMocks(); (coverageService.getBoxPorts as Mock).mockResolvedValue(ports); });

  it('carga y muestra los puertos de la caja', async () => {
    render(<BoxPortsModal box={box} onChanged={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByText('Puertos · NAP-014')).toBeInTheDocument();
    expect(coverageService.getBoxPorts).toHaveBeenCalledWith('b1');
  });

  it('dañar un puerto libre confirma y llama damagePort + onChanged', async () => {
    (coverageService.damagePort as Mock).mockResolvedValue(undefined);
    const onChanged = vi.fn();
    render(<BoxPortsModal box={box} onChanged={onChanged} onClose={vi.fn()} />);
    await screen.findByText('Puertos · NAP-014');

    fireEvent.click(screen.getByRole('button', { name: 'Dañar' }));                 // detalle (puerto 1 = Free)
    fireEvent.click(await screen.findByRole('button', { name: /Marcar dañado/ }));   // confirmación

    await waitFor(() => expect(coverageService.damagePort).toHaveBeenCalledWith('b1', 1));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
