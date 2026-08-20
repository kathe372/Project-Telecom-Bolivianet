import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ZoneFormModal from './ZoneFormModal';
import type { CoverageZone } from '@/types/coverage';

const ZONE: CoverageZone = {
  id: 'z1', nombre: 'Zona Centro', tecnologia: 'GPON',
  velocidadMaxMbps: 100, estado: 'Activa',
};

// Helper: finds the Estado <select> (second combobox: Tecnología, Estado)
const getEstadoSelect = () => screen.getAllByRole('combobox')[1];

describe('ZoneFormModal', () => {
  it('TC-MODAL01 — muestra campo FechaExpansion solo cuando estado es EnExpansion', async () => {
    render(<ZoneFormModal open zone={null} initialGeoJson='{"type":"Point"}' saving={false} onSave={vi.fn()} onClose={vi.fn()} />);

    // Default is Planificada — date field visible; change to Activa — should hide
    fireEvent.change(getEstadoSelect(), { target: { value: 'Activa' } });

    await waitFor(() =>
      expect(screen.queryByPlaceholderText(/fecha/i)).not.toBeInTheDocument()
    );

    // Then switch to EnExpansion — date field should reappear
    fireEvent.change(getEstadoSelect(), { target: { value: 'EnExpansion' } });
    await waitFor(() =>
      expect(screen.getByRole('textbox', { hidden: true })).toBeInTheDocument()
    );
  });

  it('TC-MODAL01b — campo fecha visible cuando estado es Planificada (valor por defecto)', () => {
    render(<ZoneFormModal open zone={null} initialGeoJson='{}' saving={false} onSave={vi.fn()} onClose={vi.fn()} />);
    // Default estado = Planificada → date input rendered
    expect(document.querySelector('input[type="date"]')).toBeInTheDocument();
  });

  it('TC-MODAL02 — NO muestra campo fecha para estado Activa', () => {
    render(<ZoneFormModal open zone={ZONE} initialGeoJson={null} saving={false} onSave={vi.fn()} onClose={vi.fn()} />);
    expect(document.querySelector('input[type="date"]')).not.toBeInTheDocument();
  });

  it('TC-MODAL05 — llama onSave con el GeoJSON recibido via prop', async () => {
    const onSave = vi.fn();
    const geoJson = '{"type":"Polygon","coordinates":[[[-66.2,-17.4],[-66.1,-17.4],[-66.1,-17.3],[-66.2,-17.4]]]}';
    render(<ZoneFormModal open zone={null} initialGeoJson={geoJson} saving={false} onSave={onSave} onClose={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Zona Centro'), { target: { value: 'Nueva Zona' } });
    fireEvent.change(getEstadoSelect(), { target: { value: 'Activa' } });

    fireEvent.click(screen.getByText('Crear zona'));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const payload = onSave.mock.calls[0][0];
    expect(payload.geoJson).toContain('Polygon');
    expect(payload.nombre).toBe('Nueva Zona');
  });

  it('llama onClose al clicar cancelar', () => {
    const onClose = vi.fn();
    render(<ZoneFormModal open zone={null} initialGeoJson='{}' saving={false} onSave={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByText('Cancelar'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('no se renderiza cuando open=false', () => {
    render(<ZoneFormModal open={false} zone={null} initialGeoJson={null} saving={false} onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByText('Nueva zona de cobertura')).not.toBeInTheDocument();
  });
});
