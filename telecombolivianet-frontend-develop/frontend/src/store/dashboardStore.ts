import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DashboardPreferences } from '@/services/dashboardService';
import { DEFAULT_PREFERENCES } from '@/services/dashboardService';

interface DashboardState {
  prefsByUser: Record<string, DashboardPreferences>;
  getPrefs:   (userId: string) => DashboardPreferences;
  setPrefs:   (userId: string, prefs: DashboardPreferences) => void;
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set, get) => ({
      prefsByUser: {},

      getPrefs: (userId) =>
        get().prefsByUser[userId] ?? DEFAULT_PREFERENCES,

      setPrefs: (userId, prefs) =>
        set((s) => ({
          prefsByUser: { ...s.prefsByUser, [userId]: prefs },
        })),
    }),
    {
      name: 'telecom-dashboard',
    }
  )
);
