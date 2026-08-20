import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BoxPanel from './BoxPanel';
import type { DistributionBox } from '@/types/coverage';

const makeBox = (overrides: Partial<DistributionBox> = {}): DistributionBox => ({
  id: 'b1', codigo: 'NAP-001', direccionReferencia: 'Av. Principal',
  zoneId: 'z1', zoneName: 'Zona Centro',
  lat: -17.389, lng: -66.156,
  puertosTotal: 8, puertosOcupados: 4, puertosReservados: 1, puertosLibres: 3,
  estado: 'Activo',
  ...overrides,
});

describe('BoxPanel', () => {
  it('TC-MAP04 — muestra el código y estado de cada caja', () => {
    render(<BoxPanel boxes={[makeBox()]} onNewBox={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('NAP-001')).toBeInTheDocument();
    expect(screen.getByText('Activo')).toBeInTheDocument();
  });

  it('muestra contadores de puertos', () => {
    render(<BoxPanel boxes={[makeBox()]} onNewBox={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/4 ocup/)).toBeInTheDocument();
    expect(screen.getByText(/1 reserv/)).toBeInTheDocument();
    expect(screen.getByText(/3 libre/)).toBeInTheDocument();
  });

  it('muestra mensaje vacío cuando no hay cajas', () => {
    render(<BoxPanel boxes={[]} onNewBox={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/Sin cajas en esta zona/)).toBeInTheDocument();
  });

  it('TC-MAP06 — llama onEdit al clicar el botón editar', async () => {
    const onEdit = vi.fn();
    const box = makeBox();
    const { container } = render(
      <BoxPanel boxes={[box]} onNewBox={vi.fn()} onEdit={onEdit} onDelete={vi.fn()} />);
    // Make the hover buttons visible
    const row = container.querySelector('.group') as HTMLElement;
    fireEvent.mouseEnter(row);
    fireEvent.click(screen.getByTitle('Editar caja'));
    expect(onEdit).toHaveBeenCalledWith(box);
  });

  it('llama onNewBox al clicar el botón Nueva', () => {
    const onNew = vi.fn();
    render(<BoxPanel boxes={[]} onNewBox={onNew} onEdit={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByText('Nueva'));
    expect(onNew).toHaveBeenCalledOnce();
  });
});
