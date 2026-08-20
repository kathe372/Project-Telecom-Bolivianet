import { Zap } from 'lucide-react';
import SectionCard from './SectionCard';
import { SkeletonChart, ErrorSection } from './SkeletonCard';
import { fmtTime } from '@/utils/dashboardFormatters';
import type { DashAutoActionsDto } from '@/services/dashboardService';

type Status = 'loading' | 'error' | 'success';

export default function DashboardAutoSection({ autoActions, status, onRetry }: {
  autoActions: DashAutoActionsDto | null; status: Status; onRetry: () => void;
}) {
  if (status === 'loading') return <SkeletonChart />;
  if (status === 'error') return <ErrorSection title="Acciones Auto" onRetry={onRetry} />;
  if (!autoActions) return null;

  return (
    <SectionCard title="Acciones automáticas hoy" icon={<Zap className="w-4 h-4 text-indigo-600" />}>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        {[
          { l: 'Suspensiones',   v: autoActions.SuspensionesHoy,             color: autoActions.SuspensionesHoy > 0 ? 'text-red-600' : 'text-gray-400' },
          { l: 'Reactivaciones', v: autoActions.ReactivacionesHoy,           color: 'text-green-600' },
          { l: 'Facturas emit.', v: autoActions.FacturasEmitidasHoy,         color: 'text-blue-600' },
          { l: 'Recordatorios',  v: autoActions.RecordatoriosEnviadosHoy,    color: 'text-indigo-600' },
          { l: 'Vencidas',       v: autoActions.FacturasVencidasMarcadasHoy, color: autoActions.FacturasVencidasMarcadasHoy > 0 ? 'text-amber-600' : 'text-gray-400' },
        ].map(({ l, v, color }) => (
          <div key={l} className="bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-xs text-gray-400 mb-1">{l}</p>
            <p className={`text-2xl font-bold ${color}`}>{v}</p>
          </div>
        ))}
      </div>
      {autoActions.Recientes.length > 0 && (
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {autoActions.Recientes.map((a, i) => (
            <div key={i} className="flex items-start gap-2 text-xs px-2 py-1.5 bg-gray-50 rounded-lg">
              <span className="text-gray-400 shrink-0 font-mono">{fmtTime(a.OcurridoAt)}</span>
              <span className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-medium ${
                a.AreaModulo === 'Facturación'    ? 'bg-blue-100 text-blue-700' :
                a.AreaModulo === 'Notificaciones' ? 'bg-green-100 text-green-700' :
                a.AreaModulo === 'Clientes'       ? 'bg-purple-100 text-purple-700' :
                'bg-gray-100 text-gray-600'
              }`}>{a.AreaModulo}</span>
              <span className="text-gray-700 truncate">{a.Detalle || a.Accion}</span>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
