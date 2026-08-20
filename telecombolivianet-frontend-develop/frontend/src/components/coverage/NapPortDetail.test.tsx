import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import NapPortDetail from './NapPortDetail';
import type { NapPort } from '@/types/coverage';

const port = (o: Partial<NapPort> = {}): NapPort => ({ numero: 1, status: 'Free', updatedAt: '', ...o });

describe('NapPortDetail', () => {
  it('en un puerto LIBRE: Dañar habilitado, Reparar deshabilitado', () => {
    render(<NapPortDetail port={port({ status: 'Free' })} onDamage={vi.fn()} onRepair={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Dañar' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reparar' })).toBeDisabled();
  });

  it('en un puerto DAÑADO: Reparar habilitado, Dañar deshabilitado', () => {
    render(<NapPortDetail port={port({ status: 'Damaged' })} onDamage={vi.fn()} onRepair={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Reparar' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Dañar' })).toBeDisabled();
  });

  it('muestra la ONU en un puerto ocupado', () => {
    render(<NapPortDetail port={port({ status: 'Used', onuSerial: 'HWTC 99AA' })} onDamage={vi.fn()} onRepair={vi.fn()} />);
    expect(screen.getByText('HWTC 99AA')).toBeInTheDocument();
  });
});
