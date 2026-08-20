import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ZonePanel from './ZonePanel';
import type { CoverageZone } from '@/types/coverage';

const ZONES: CoverageZone[] = [
  { id: 'z1', nombre: 'Zona Centro', tecnologia: 'GPON', velocidadMaxMbps: 100,
    estado: 'Activa', boxCount: 3 },
  { id: 'z2', nombre: 'Zona Norte', tecnologia: 'WIMAX', velocidadMaxMbps: 50,
    estado: 'EnExpansion', boxCount: 0 },
  { id: 'z3', nombre: 'Zona Sur', tecnologia: 'CABLE', velocidadMaxMbps: 30,
    estado: 'Inactiva', boxCount: 1 },
];

describe('ZonePanel', () => {
  it('TC-MAP02 — muestra el nombre y estado de cada zona', () => {
    render(<ZonePanel zones={ZONES} selectedZoneId={null} onSelectZone={vi.fn()} onNewZone={vi.fn()} />);
    expect(screen.getByText('Zona Centro')).toBeInTheDocument();
    expect(screen.getByText('Zona Norte')).toBeInTheDocument();
    expect(screen.getByText('Activa')).toBeInTheDocument();
    expect(screen.getByText('EnExpansion')).toBeInTheDocument();
  });

  it('TC-MAP03 — muestra mensaje vacío cuando no hay zonas', () => {
    render(<ZonePanel zones={[]} selectedZoneId={null} onSelectZone={vi.fn()} onNewZone={vi.fn()} />);
    expect(screen.getByText(/No hay zonas/)).toBeInTheDocument();
  });

  it('TC-MAP05 — llama onSelectZone con el id correcto al clicar una zona', () => {
    const onSelect = vi.fn();
    render(<ZonePanel zones={ZONES} selectedZoneId={null} onSelectZone={onSelect} onNewZone={vi.fn()} />);
    fireEvent.click(screen.getByText('Zona Centro'));
    expect(onSelect).toHaveBeenCalledWith('z1');
  });

  it('llama onNewZone al clicar el botón Nueva', () => {
    const onNew = vi.fn();
    render(<ZonePanel zones={ZONES} selectedZoneId={null} onSelectZone={vi.fn()} onNewZone={onNew} />);
    fireEvent.click(screen.getByText('Nueva'));
    expect(onNew).toHaveBeenCalledOnce();
  });

  it('aplica estilos de selección a la zona activa', () => {
    render(<ZonePanel zones={ZONES} selectedZoneId="z1" onSelectZone={vi.fn()} onNewZone={vi.fn()} />);
    const button = screen.getByText('Zona Centro').closest('button');
    expect(button?.className).toContain('border-l-blue-500');
  });
});
