import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/services/businessScheduleService', () => ({
  businessScheduleService: { create: vi.fn(), update: vi.fn() },
}));
import { businessScheduleService } from '@/services/businessScheduleService';
import WorkingHoursForm from './WorkingHoursForm';

describe('WorkingHoursForm', () => {
  beforeEach(() => vi.clearAllMocks());

  it('crear (sin schedule) llama create al guardar', async () => {
    (businessScheduleService.create as Mock).mockResolvedValue({});
    render(<WorkingHoursForm schedule={null} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Guardar horario/ }));
    await waitFor(() => expect(businessScheduleService.create).toHaveBeenCalled());
  });

  it('togglear un día cambia su estilo (queda seleccionado)', () => {
    render(<WorkingHoursForm schedule={null} onSaved={vi.fn()} />);
    const dom = screen.getByRole('button', { name: 'Dom' });   // Dom arranca off (mask 31 = L-V)
    fireEvent.click(dom);
    expect(dom).toHaveClass('bg-blue-600');
  });
});
