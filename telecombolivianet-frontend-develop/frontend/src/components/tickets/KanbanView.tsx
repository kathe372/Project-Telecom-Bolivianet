import { User, CalendarClock } from 'lucide-react';
import type { TicketListItemDto } from '@/types/ticket.types';
import {
  KANBAN_ORDER, KANBAN_LABELS, KANBAN_COLORS, getSlaInfo, priorityBadge,
} from './ticketHelpers';

export function KanbanView({
  kanban, onTicketClick,
}: {
  kanban: Record<string, TicketListItemDto[]>;
  onTicketClick: (t: TicketListItemDto) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {KANBAN_ORDER.map(col => {
        const items = kanban[col] ?? [];
        const { border, head } = KANBAN_COLORS[col] ?? { border: 'border-gray-200 bg-gray-50', head: 'bg-gray-100 text-gray-600' };
        return (
          <div key={col} className={`rounded-xl border-2 ${border} flex flex-col min-h-[200px]`}>
            <div className={`${head} rounded-t-lg px-3 py-2 flex items-center justify-between`}>
              <span className="text-sm font-semibold">{KANBAN_LABELS[col]}</span>
              <span className="text-xs font-bold bg-white/60 rounded-full px-2 py-0.5">{items.length}</span>
            </div>
            <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[60vh]">
              {items.length === 0
                ? <p className="text-xs text-center text-gray-400 py-8">Sin tickets</p>
                : items.map(t => {
                    const sla = getSlaInfo(t);
                    return (
                      <div key={t.Id}
                        className="bg-white rounded-lg shadow-sm p-3 cursor-pointer hover:shadow-md transition-shadow border border-transparent hover:border-gray-200"
                        onClick={() => onTicketClick(t)}>
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="text-sm font-medium text-gray-900 leading-tight line-clamp-2">{t.Subject}</p>
                          {priorityBadge(t.Priority)}
                        </div>
                        <p className="text-xs text-gray-500 truncate">{t.ClientName}</p>
                        <p className={`text-xs mt-1.5 ${sla.color}`}>{sla.label}</p>
                        {t.AssignedToName && (
                          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                            <User className="w-3 h-3" />{t.AssignedToName}
                          </p>
                        )}
                        {t.NextVisitAt && (
                          <p className="text-xs text-indigo-600 mt-1 flex items-center gap-1">
                            <CalendarClock className="w-3 h-3" />
                            {new Date(t.NextVisitAt).toLocaleString('es-BO', {
                              day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                            })}
                            {t.NextVisitTechnicianName && ` · ${t.NextVisitTechnicianName}`}
                          </p>
                        )}
                      </div>
                    );
                  })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
