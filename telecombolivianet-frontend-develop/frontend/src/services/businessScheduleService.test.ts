import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('./api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from './api';
import { businessScheduleService } from './businessScheduleService';

const SCH = {
  Id: 's1', Name: 'Atención', TimeZoneName: 'America/La_Paz', UtcOffsetHours: -4,
  WorkingDaysMask: 31, WorkingDaysDisplay: ['Lun', 'Mar'], StartHour: 8, EndHour: 18,
  Is24x7: false, IsDefault: true, IsActive: true,
  Holidays: [{ Id: 'h1', Date: '2026-08-06', Name: 'Feriado' }],
};

describe('businessScheduleService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getAll mapea PascalCase→camelCase (incl. holidays)', async () => {
    (api.get as Mock).mockResolvedValueOnce({ data: { data: [SCH] } });
    const r = await businessScheduleService.getAll();
    expect(api.get).toHaveBeenCalledWith('/business-schedules');
    expect(r[0]).toMatchObject({ id: 's1', name: 'Atención', workingDaysMask: 31, startHour: 8, isDefault: true });
    expect(r[0].holidays[0]).toMatchObject({ id: 'h1', date: '2026-08-06', name: 'Feriado' });
  });

  it('addHoliday llama POST …/holidays con {date,name}', async () => {
    (api.post as Mock).mockResolvedValueOnce({});
    await businessScheduleService.addHoliday('s1', '2026-12-25', 'Navidad');
    expect(api.post).toHaveBeenCalledWith('/business-schedules/s1/holidays', { date: '2026-12-25', name: 'Navidad' });
  });

  it('removeHoliday llama DELETE …/holidays/:hid', async () => {
    (api.delete as Mock).mockResolvedValueOnce({});
    await businessScheduleService.removeHoliday('s1', 'h1');
    expect(api.delete).toHaveBeenCalledWith('/business-schedules/s1/holidays/h1');
  });
});
