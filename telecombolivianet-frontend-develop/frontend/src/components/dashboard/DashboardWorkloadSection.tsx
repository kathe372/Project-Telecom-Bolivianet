import { HardHat, AlertTriangle } from 'lucide-react';
import SectionCard from './SectionCard';
import { SkeletonTable, ErrorSection } from './SkeletonCard';
import type { TechniciansWorkloadDto } from '@/services/dashboardService';

type Status = 'loading' | 'error' | 'success';

export default function DashboardWorkloadSection({ data, status, onRetry }: {
  data: TechniciansWorkloadDto | null; status: Status; onRetry: () => void;
}) {
  if (status === 'loading') return <SkeletonTable />;
  if (status === 'error')   return <ErrorSection title="No se pudo cargar el workload de técnicos." onRetry={onRetry} />;
  if (!data) return null;

  return (
    <SectionCard title="Carga de Técnicos" icon={<HardHat className="w-4 h-4 text-blue-500" />}>
      {data.TotalSinAsignar > 0 && (
        <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-red-50 text-red-700 text-xs">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {data.TotalSinAsignar} ticket{data.TotalSinAsignar !== 1 ? 's' : ''} sin técnico asignado
        </div>
      )}
      {data.Tecnicos.length === 0
        ? <p className="text-sm text-gray-400 text-center py-8">Sin técnicos con tickets activos</p>
        : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 border-b border-gray-100">
                  <th className="text-left py-2 pr-2 font-medium">Técnico</th>
                  <th className="text-right py-2 pr-2 font-medium">Activos</th>
                  <th className="text-right py-2 pr-2 font-medium">Críticos</th>
                  <th className="text-right py-2 pr-2 font-medium">En visita</th>
                  <th className="text-right py-2 font-medium">Prom. abierto</th>
                </tr>
              </thead>
              <tbody>
                {data.Tecnicos.map(t => (
                  <tr key={t.TecnicoNombre} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-2 font-medium text-gray-800 truncate max-w-[120px]">{t.TecnicoNombre}</td>
                    <td className="py-2 pr-2 text-right text-gray-700">{t.TicketsActivos}</td>
                    <td className="py-2 pr-2 text-right">
                      {t.TicketsCriticos > 0
                        ? <span className="font-bold text-red-600">{t.TicketsCriticos}</span>
                        : <span className="text-gray-300">0</span>}
                    </td>
                    <td className="py-2 pr-2 text-right text-gray-500">{t.TicketsEnVisita}</td>
                    <td className="py-2 text-right text-gray-500">
                      {t.PromedioHorasAbierto < 24
                        ? `${Math.round(t.PromedioHorasAbierto)}h`
                        : `${Math.round(t.PromedioHorasAbierto / 24)}d`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
    </SectionCard>
  );
}
