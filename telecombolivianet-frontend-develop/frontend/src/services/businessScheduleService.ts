import api from './api';
import type { BusinessSchedule, ScheduleHoliday, SaveScheduleInput } from '@/types/businessSchedule';
import type { ApiResponse } from '@/types/auth.types';

interface ApiHoliday { Id: string; Date: string; Name: string; }
interface ApiSchedule {
  Id: string; Name: string; TimeZoneName: string; UtcOffsetHours: number;
  WorkingDaysMask: number; WorkingDaysDisplay: string[]; StartHour: number; EndHour: number;
  Is24x7: boolean; IsDefault: boolean; IsActive: boolean; Holidays: ApiHoliday[];
}

const toHoliday = (h: ApiHoliday): ScheduleHoliday => ({ id: h.Id, date: h.Date, name: h.Name });
const toSchedule = (s: ApiSchedule): BusinessSchedule => ({
  id: s.Id, name: s.Name, timeZoneName: s.TimeZoneName, utcOffsetHours: s.UtcOffsetHours,
  workingDaysMask: s.WorkingDaysMask, workingDaysDisplay: s.WorkingDaysDisplay,
  startHour: s.StartHour, endHour: s.EndHour, is24x7: s.Is24x7, isDefault: s.IsDefault,
  isActive: s.IsActive, holidays: (s.Holidays ?? []).map(toHoliday),
});

export const businessScheduleService = {
  getAll: async (): Promise<BusinessSchedule[]> => {
    const res = await api.get<ApiResponse<ApiSchedule[]>>('/business-schedules');
    return (res.data.data ?? []).map(toSchedule);
  },
  create: (dto: SaveScheduleInput) => api.post('/business-schedules', dto),
  update: (id: string, dto: SaveScheduleInput) => api.put(`/business-schedules/${id}`, dto),
  addHoliday: (id: string, date: string, name: string) =>
    api.post(`/business-schedules/${id}/holidays`, { date, name }),
  removeHoliday: (id: string, holidayId: string) =>
    api.delete(`/business-schedules/${id}/holidays/${holidayId}`),
};
