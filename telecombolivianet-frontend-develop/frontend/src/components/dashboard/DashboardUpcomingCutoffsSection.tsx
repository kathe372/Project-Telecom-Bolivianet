import { useState } from 'react';
import { fmtBs } from '@/utils/dashboardFormatters';
import { SkeletonChart, ErrorSection } from './SkeletonCard';
import SectionCard from './SectionCard';
import { Scissors, ChevronDown, ChevronUp } from 'lucide-react';
import type { UpcomingCutoffsDto } from '@/services/dashboardService';

type Status = 'loading' | 'error' | 'success';

const COLLAPSED_ROWS = 4;

function diasLabel(dias: number): { text: string; color: string } {
  if (dias < 0)  return { text: `Venció hace ${Math.abs(dias)}d`, color: 'text-red-700 font-bold' };
  if (dias === 0) return { text: 'Vence HOY',                      color: 'text-red-600 font-bold' };
  if (dias <= 2)  return { text: `${dias}d restantes`,             color: 'text-red-500 font-semibold' };
  return           { text: `${dias}d restantes`,                   color: 'text-amber-600' };
}

export default function DashboardUpcomingCutoffsSection({
  data, status, onRetry,
}: { data: UpcomingCutoffsDto | null; status: Status; onRetry: () => void }) {
  const [expanded, setExpanded] = useState(false);

  if (status === 'loading') return <SkeletonChart />;
  if (status === 'error')   return <ErrorSection title="No se pudieron cargar los próximos a corte." onRetry={onRetry} />;
  if (!data) return null;

  if (data.Total === 0) return (
    <SectionCard title="Próximos a Corte (7 días)" icon={<Scissors className="w-4 h-4 text-gray-400" />}>
      <p className="text-sm text-green-600">Sin clientes próximos a corte ✓</p>
    </SectionCard>
  );

  const shownClientes = expanded ? data.Clientes : data.Clientes.slice(0, COLLAPSED_ROWS);

  return (
    <SectionCard
      title="Próximos a Corte (7 días)"
      icon={<Scissors className="w-4 h-4 text-red-500" />}
      subtitle={`${data.Total} clientes activos con deuda que vence pronto`}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 border-b">
              <th className="text-left pb-2 font-medium">Cliente</th>
              <th className="text-left pb-2 font-medium">Zona</th>
              <th className="text-right pb-2 font-medium">Monto</th>
              <th className="text-right pb-2 font-medium">Vencimiento</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {shownClientes.map(c => {
              const label = diasLabel(c.DiasParaCorte);
              return (
                <tr key={c.ClienteId} className="hover:bg-gray-50 transition-colors">
                  <td className="py-2 font-medium text-gray-800">{c.ClienteNombre}</td>
                  <td className="py-2 text-gray-500 text-xs">{c.Zona}</td>
                  <td className="py-2 text-right font-semibold text-gray-800">{fmtBs(c.MontoDeuda)}</td>
                  <td className={`py-2 text-right text-xs ${label.color}`}>{label.text}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {data.Clientes.length > COLLAPSED_ROWS && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:underline mt-2 mx-auto"
        >
          {expanded
            ? <>Ver menos <ChevronUp className="w-3 h-3" /></>
            : <>Ver {data.Clientes.length - COLLAPSED_ROWS} más <ChevronDown className="w-3 h-3" /></>}
        </button>
      )}
    </SectionCard>
  );
}
