import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { NewInstallationModal } from './NewInstallationModal';

vi.mock('@/services/installationService', () => ({ createInstallation: vi.fn() }));
vi.mock('@/services/clientService', () => ({
  planService: { getAll: vi.fn().mockResolvedValue([]) },
  searchClients: vi.fn().mockResolvedValue({ Items: [] }),
}));

beforeEach(() => vi.clearAllMocks());

describe('NewInstallationModal — TC-CAL-F06', () => {
  it('TC-CAL-F06 — pre-rellena fecha y hora desde las props', () => {
    const { container } = render(
      <NewInstallationModal
        defaultFecha="2026-07-20"
        defaultHora="09:30"
        onClose={() => {}}
        onDone={() => {}}
      />,
    );
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement;
    const timeInput = container.querySelector('input[type="time"]') as HTMLInputElement;
    expect(dateInput.value).toBe('2026-07-20');
    expect(timeInput.value).toBe('09:30');
  });

  it('TC-CAL-F06b — sin props los campos quedan vacíos (compatibilidad)', () => {
    const { container } = render(
      <NewInstallationModal onClose={() => {}} onDone={() => {}} />,
    );
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement;
    const timeInput = container.querySelector('input[type="time"]') as HTMLInputElement;
    expect(dateInput.value).toBe('');
    expect(timeInput.value).toBe('');
  });
});
