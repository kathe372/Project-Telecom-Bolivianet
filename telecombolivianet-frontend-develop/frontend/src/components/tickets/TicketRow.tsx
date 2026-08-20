import { ChevronRight } from 'lucide-react';
import type { TicketListItemDto } from '@/types/ticket.types';
import { getSlaInfo, priorityBadge, statusBadge, typeBadge } from './ticketHelpers';

export function TicketRow({ ticket, onClick }: { ticket: TicketListItemDto; onClick: () => void }) {
  const sla = getSlaInfo(ticket);
  return (
    <tr className="hover:bg-gray-50 cursor-pointer transition-colors" onClick={onClick}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 mb-0.5">
          {ticket.TicketNumber && (
            <span className="text-xs font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 shrink-0">
              {ticket.TicketNumber}
            </span>
          )}
          {ticket.AutoAssigned && (
            <span className="text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100 shrink-0" title="Auto-asignado por balanceo">
              ⚖️ Auto
            </span>
          )}
        </div>
        <p className="font-medium text-gray-900 text-sm">{ticket.Subject}</p>
        <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{ticket.Description}</p>
      </td>
      <td className="px-4 py-3">
        <p className="text-sm font-medium text-gray-800">{ticket.ClientName}</p>
        <p className="text-xs text-gray-400">{ticket.ClientTbn}</p>
      </td>
      <td className="px-4 py-3">{typeBadge(ticket.Type)}</td>
      <td className="px-4 py-3">{statusBadge(ticket.Status)}</td>
      <td className="px-4 py-3">{priorityBadge(ticket.Priority)}</td>
      <td className="px-4 py-3">
        <span className={`text-xs ${sla.color}`}>{sla.label}</span>
        {sla.badge && (
          <span className={`ml-1 text-xs px-1.5 py-0.5 rounded font-semibold
            ${sla.badge === 'CUMPLIDO' ? 'bg-green-100 text-green-700' :
              sla.badge === 'VENCIDO' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
            {sla.badge}
          </span>
        )}
        {ticket.SlaDeadline && (
          <p className="text-xs text-gray-400 mt-0.5">
            Límite: {new Date(ticket.SlaDeadline).toLocaleDateString('es-BO')}
          </p>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-gray-500">
        {ticket.AssignedToName ?? <span className="italic text-gray-300">Sin asignar</span>}
        {ticket.NextVisitAt && (() => {
          const afterSla = !!ticket.SlaDeadline &&
            new Date(ticket.NextVisitAt).getTime() > new Date(ticket.SlaDeadline).getTime();
          return (
            <p className={`mt-1 ${afterSla ? 'text-red-600 font-medium' : 'text-indigo-600'}`}
               title={afterSla ? 'La visita cae después del vencimiento del SLA' : undefined}>
              🗓️ {new Date(ticket.NextVisitAt).toLocaleString('es-BO', {
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
              })}
              {ticket.NextVisitTechnicianName && ` · ${ticket.NextVisitTechnicianName}`}
              {afterSla && ' ⚠️'}
            </p>
          );
        })()}
      </td>
      <td className="px-4 py-3">
        <ChevronRight className="w-4 h-4 text-gray-300" />
      </td>
    </tr>
  );
}
