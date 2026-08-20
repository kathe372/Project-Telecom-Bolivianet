import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BoxFormModal from './BoxFormModal';
import type { CoverageZone, DistributionBox } from '@/types/coverage';

const ZONE_ID = '00000000-0000-0000-0000-000000000001';

const ZONES: CoverageZone[] = [
  { id: ZONE_ID, nombre: 'Zona Centro', tecnologia: 'GPON', velocidadMaxMbps: 100, estado: 'Activa' },
];

const BOX: DistributionBox = {
  id: '00000000-0000-0000-0000-000000000002', codigo: 'NAP-001', direccionReferencia: 'Av. Principal',
  zoneId: ZONE_ID, zoneName: 'Zona Centro',
  lat: -17.389, lng: -66.156,
  puertosTotal: 8, puertosOcupados: 4, puertosReservados: 1, puertosLibres: 3,
  estado: 'Activo',
};

describe('BoxFormModal', () => {
  it('TC-MODAL03 — campo PuertosOcupados NO existe en modo creación', () => {
    render(<BoxFormModal
      open zones={ZONES} box={null}
      pendingLat={-17.389} pendingLng={-66.156}
      saving={false} onSave={vi.fn()} onClose={vi.fn()}
    />);
    // "Puertos ocupados" label only renders in edit mode
    expect(screen.queryByText('Puertos ocupados')).not.toBeInTheDocument();
  });

  it('TC-MODAL03b — campo PuertosOcupados existe en modo edición', () => {
    render(<BoxFormModal
      open zones={ZONES} box={BOX}
      saving={false} onSave={vi.fn()} onClose={vi.fn()}
    />);
    expect(screen.getByText('Puertos ocupados')).toBeInTheDocument();
  });

  it('TC-MODAL06 — muestra coordenadas capturadas del mapa', () => {
    render(<BoxFormModal
      open zones={ZONES} box={null}
      pendingLat={-17.389123} pendingLng={-66.156456}
      saving={false} onSave={vi.fn()} onClose={vi.fn()}
    />);
    expect(screen.getByText(/Ubicación capturada/)).toBeInTheDocument();
    expect(screen.getByText(/-17\.389123/)).toBeInTheDocument();
  });

  it('TC-MODAL04 — botón Crear caja deshabilitado sin pin colocado', () => {
    render(<BoxFormModal
      open zones={ZONES} box={null}
      pendingLat={undefined} pendingLng={undefined}
      saving={false} onSave={vi.fn()} onClose={vi.fn()}
    />);
    expect(screen.getByText('Crear caja').closest('button')).toBeDisabled();
  });

  it('llama onSave con datos correctos en modo creación', async () => {
    const onSave = vi.fn();
    render(<BoxFormModal
      open zones={ZONES} box={null}
      preselectedZoneId={ZONE_ID}
      pendingLat={-17.389} pendingLng={-66.156}
      saving={false} onSave={onSave} onClose={vi.fn()}
    />);

    fireEvent.change(screen.getByPlaceholderText('NAP-001'), { target: { value: 'NAP-005' } });
    fireEvent.change(screen.getByPlaceholderText(/Av. Principal/), { target: { value: 'Calle 5' } });
    fireEvent.click(screen.getByText('Crear caja'));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const payload = onSave.mock.calls[0][0];
    expect(payload.codigo).toBe('NAP-005');
    expect(payload.lat).toBe(-17.389);
    expect(payload.lng).toBe(-66.156);
  });

  it('no se renderiza cuando open=false', () => {
    render(<BoxFormModal
      open={false} zones={ZONES} box={null}
      saving={false} onSave={vi.fn()} onClose={vi.fn()}
    />);
    expect(screen.queryByText('Nueva caja NAP')).not.toBeInTheDocument();
  });
});
