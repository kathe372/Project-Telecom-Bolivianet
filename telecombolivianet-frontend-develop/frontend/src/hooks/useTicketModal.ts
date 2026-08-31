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
    } catch {
      // Deliberadamente silencioso, y por una razón distinta a los demás casos:
      // esto refresca un ticket que YA está en pantalla. Si la relectura falla,
      // lo correcto es conservar lo último bueno; borrarlo cerraría el modal
      // delante del usuario. Quien necesita avisar del fallo es quien lanzó la
      // acción, y ese aviso lo da TicketDetailModal.reload().
    }
  }, []);

  return { ticket, loading, openTicket, closeTicket, refreshTicket };
}
