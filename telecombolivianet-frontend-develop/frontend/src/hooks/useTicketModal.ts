import { useState, useCallback } from 'react';
import { ticketService } from '@/services/ticketService';
import type { TicketDetailDto } from '@/types/ticket.types';

export function useTicketModal() {
  const [ticket,  setTicket]  = useState<TicketDetailDto | null>(null);
  const [loading, setLoading] = useState(false);

  const openTicket = useCallback(async (id: string) => {
    setLoading(true);
    try {
      setTicket(await ticketService.getById(id));
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  const closeTicket = useCallback(() => setTicket(null), []);

  const refreshTicket = useCallback(async (id: string) => {
    try {
      setTicket(await ticketService.getById(id));
    } catch {  }
  }, []);

  return { ticket, loading, openTicket, closeTicket, refreshTicket };
}
