import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NapPortCell from './NapPortCell';
import type { NapPort } from '@/types/coverage';

const port = (o: Partial<NapPort> = {}): NapPort => ({ numero: 1, status: 'Free', updatedAt: '', ...o });

describe('NapPortCell', () => {
  it('muestra el número y la etiqueta de estado', () => {
    render(<NapPortCell port={port({ numero: 7, status: 'Reserved' })} selected={false} onSelect={vi.fn()} />);
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('Reservado')).toBeInTheDocument();
  });

  it('llama onSelect con el número al clicar', () => {
    const onSelect = vi.fn();
    render(<NapPortCell port={port({ numero: 4 })} selected={false} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith(4);
  });
});
