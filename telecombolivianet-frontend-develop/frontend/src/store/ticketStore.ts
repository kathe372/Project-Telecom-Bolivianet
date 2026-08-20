import { create } from 'zustand';

interface TicketState {
  slaBreachedCount: number;
  setSlaBreachedCount: (count: number) => void;
}

export const useTicketStore = create<TicketState>()((set) => ({
  slaBreachedCount: 0,
  setSlaBreachedCount: (count) => set({ slaBreachedCount: count }),
}));
