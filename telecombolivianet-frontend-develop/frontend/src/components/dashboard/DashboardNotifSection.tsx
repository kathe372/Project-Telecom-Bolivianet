import { MessageCircle } from 'lucide-react';
import SectionCard from './SectionCard';
import { SkeletonChart, ErrorSection } from './SkeletonCard';
import type { DashNotifDto } from '@/services/dashboardService';

type Status = 'loading' | 'error' | 'success';

export default function DashboardNotifSection({ notifStats, status, onRetry }: {
  notifStats: DashNotifDto | null; status: Status; onRetry: () => void;
}) {
  if (status === 'loading') return <SkeletonChart />;
  if (status === 'error')   return <ErrorSection title="Notificaciones" onRetry={onRetry} />;
  if (!notifStats) return null;

  return (
    <SectionCard title="Notificaciones WhatsApp (24h)" icon={<MessageCircle className="w-4 h-4 text-green-600" />}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="text-center p-2 rounded-lg bg-green-50">
          <p className="text-lg font-bold text-green-700">{notifStats.EnviadasUlt24h}</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Enviadas</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-red-50">
          <p className="text-lg font-bold text-red-700">{notifStats.FallidasUlt24h}</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Fallidas</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-amber-50">
          <p className="text-lg font-bold text-amber-700">{notifStats.PendientesEnCola}</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">En cola</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-blue-50">
          <p className="text-lg font-bold text-blue-700">{Math.round(notifStats.TasaExitoUlt24h)}%</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Éxito</p>
        </div>
      </div>

      {notifStats.PorTipo.length === 0
        ? <p className="text-sm text-gray-400 text-center py-4">Sin actividad en las últimas 24h</p>
        : (
          <div className="space-y-1.5">
            {notifStats.PorTipo.map(t => (
              <div key={t.NotifTipo} className="flex items-center gap-2 text-xs">
                <span className="text-gray-700 flex-1 truncate">{t.NotifTipo}</span>
                <span className="text-green-600 font-medium">{t.Enviadas} env.</span>
                {t.Fallidas > 0 && <span className="text-red-500 font-medium">{t.Fallidas} fall.</span>}
                {t.Pendientes > 0 && <span className="text-amber-600 font-medium">{t.Pendientes} pend.</span>}
              </div>
            ))}
          </div>
        )
      }
    </SectionCard>
  );
}
