import { Loader2 } from 'lucide-react';
import { ErrorDeCarga } from '@/components/shared/ErrorDeCarga';
import type { TicketActivityDto } from '@/types/ticket.types';

export function HistoryTab({
  activity, activityLoaded, fallo, onReintentar,
}: {
  activity: TicketActivityDto[];
  activityLoaded: boolean;
  /** La carga falló. Sin esto el spinner giraba para siempre. */
  fallo?: boolean;
  onReintentar?: () => void;
}) {
  if (fallo) {
    return <ErrorDeCarga que="el historial del ticket" onReintentar={onReintentar} />;
  }

  if (!activityLoaded) {
    return (
      <p className="text-sm text-gray-400 text-center py-8 flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />Cargando historial...
      </p>
    );
  }
  if (activity.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">Sin actividad registrada para este ticket.</p>;
  }
  return (
    <div className="relative">
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-100" />
      <div className="space-y-3 pl-10">
        {activity.map(a => (
          <div key={a.Id} className="relative">
            <div className="absolute -left-6 top-1.5 w-2.5 h-2.5 rounded-full bg-blue-200 border-2 border-white ring-1 ring-blue-300" />
            <div className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-mono font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                  {a.Action}
                </span>
                <span className="text-xs text-gray-400">{a.UserName}</span>
                <span className="text-xs text-gray-300 ml-auto">
                  {new Date(a.Timestamp).toLocaleString('es-BO')}
                </span>
              </div>
              <p className="text-xs text-gray-600">{a.Description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
