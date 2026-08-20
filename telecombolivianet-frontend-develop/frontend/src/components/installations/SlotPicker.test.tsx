import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/services/installationService', () => ({ getAvailableSlots: vi.fn() }));
import { getAvailableSlots } from '@/services/installationService';
import SlotPicker from './SlotPicker';

describe('SlotPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getAvailableSlots as Mock).mockResolvedValue([
      { fecha: '2026-08-10', horaInicio: '09:00', horaFin: '11:00', disponibles: 2, disponible: true },
      { fecha: '2026-08-10', horaInicio: '11:00', horaFin: '13:00', disponibles: 0, disponible: false },
    ]);
  });

  it('renderiza franjas y llama onPick al elegir una disponible', async () => {
    const onPick = vi.fn();
    render(<SlotPicker planId="p1" onPick={onPick} />);
    fireEvent.click(await screen.findByRole('button', { name: '09:00' }));
    expect(onPick).toHaveBeenCalledWith('2026-08-10', '09:00');
  });

  it('la franja no disponible queda deshabilitada', async () => {
    render(<SlotPicker planId="p1" onPick={vi.fn()} />);
    expect(await screen.findByRole('button', { name: '11:00' })).toBeDisabled();
  });

  it('sin plan no renderiza nada', () => {
    const { container } = render(<SlotPicker planId="" onPick={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});
