import { create } from 'zustand';
import type { InternalAlertDto } from '@/types/alert.types';

interface NotificationState {
  alerts:      InternalAlertDto[];
  unreadCount: number;
  setAlerts:   (alerts: InternalAlertDto[]) => void;
  removeAlert: (id: string) => void;
  clearAll:    () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  alerts:      [],
  unreadCount: 0,
  setAlerts: (alerts) => set({ alerts, unreadCount: alerts.length }),
  removeAlert: (id) => set((s) => {
    const alerts = s.alerts.filter(a => a.Id !== id);
    return { alerts, unreadCount: alerts.length };
  }),
  clearAll: () => set({ alerts: [], unreadCount: 0 }),
}));
