import { useEffect, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { ticketService } from '@/services/ticketService';
import type { TicketListItemDto } from '@/types/ticket.types';

export function TicketsTab({ clientId, onOpenTicket }: { clientId: string; onOpenTicket: (id: string) => void }) {
  const [tickets, setTickets]   = useState<TicketListItemDto[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState(false);

  useEffect(() => {
    ticketService.getByClient(clientId)
      .then(setTickets)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [clientId]);

  const STATUS_COLOR: Record<string, string> = {
    Abierto:   'bg-blue-100 text-blue-800',
    EnProceso: 'bg-amber-100 text-amber-800',
    Resuelto:  'bg-green-100 text-green-800',
    Cerrado:   'bg-gray-100 text-gray-600',
  };

  const PRIORITY_COLOR: Record<string, string> = {
    Critica: 'bg-red-100 text-red-800',
    Alta:    'bg-orange-100 text-orange-800',
    Media:   'bg-yellow-100 text-yellow-800',
    Baja:    'bg-gray-100 text-gray-600',
  };

  if (loading) return (
    <div className="card p-8 flex justify-center">
      <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
    </div>
  );

  if (error) return (
    <div className="card p-6 flex items-center gap-2 text-red-600 text-sm">
      <AlertCircle className="w-4 h-4" />
      No se pudo cargar los tickets del cliente.
    </div>
  );

  if (tickets.length === 0) return (
    <div className="card p-8 text-center text-gray-400 text-sm">
      Este cliente no tiene tickets registrados.
    </div>
  );

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-600">#</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Asunto</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Prioridad</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Estado</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Asignado a</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Fecha</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {tickets.map((t) => (
            <tr
              key={t.Id}
              onClick={() => onOpenTicket(t.Id)}
              className="hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                {t.TicketNumber ?? t.Id.slice(0, 8)}
              </td>
              <td className="px-4 py-3">
                <p className="font-medium text-gray-900 truncate max-w-xs">{t.Subject}</p>
                <p className="text-xs text-gray-400">{t.Type}</p>
              </td>
              <td className="px-4 py-3">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_COLOR[t.Priority] ?? 'bg-gray-100 text-gray-600'}`}>
                  {t.Priority}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLOR[t.Status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {t.Status}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-600 text-xs">
                {t.AssignedToName ?? <span className="text-amber-600">Sin asignar</span>}
              </td>
              <td className="px-4 py-3 text-gray-500 text-xs">
                {new Date(t.CreatedAt).toLocaleDateString('es-BO')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
