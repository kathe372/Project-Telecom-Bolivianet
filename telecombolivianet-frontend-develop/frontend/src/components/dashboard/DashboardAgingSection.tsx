import { Landmark } from 'lucide-react';
import SectionCard from './SectionCard';
import { SkeletonChart, ErrorSection } from './SkeletonCard';
import { fmtBs } from '@/utils/dashboardFormatters';
import type { AgingPortfolioDto } from '@/services/dashboardService';

type Status = 'loading' | 'error' | 'success';

const BUCKET_COLOR = ['#22c55e', '#f59e0b', '#f97316', '#ef4444'];

export default function DashboardAgingSection({ data, status, onRetry }: {
  data: AgingPortfolioDto | null; status: Status; onRetry: () => void;
}) {
  if (status === 'loading') return <SkeletonChart />;
  if (status === 'error')   return <ErrorSection title="No se pudo cargar el aging de cartera." onRetry={onRetry} />;
  if (!data) return null;

  const maxMonto = Math.max(...data.Buckets.map(b => b.MontoTotal), 1);

  return (
    <SectionCard
      title="Aging de Cartera"
      icon={<Landmark className="w-4 h-4 text-red-500" />}
      subtitle={`${fmtBs(data.TotalCartera)} en ${data.TotalFacturas} factura${data.TotalFacturas !== 1 ? 's' : ''} vencida${data.TotalFacturas !== 1 ? 's' : ''}`}
    >
      {data.Buckets.length === 0
        ? <p className="text-sm text-gray-400 text-center py-8">✅ Sin facturas vencidas</p>
        : (
          <div className="space-y-3">
            {data.Buckets.map((b, i) => {
              const pct = (b.MontoTotal / maxMonto) * 100;
              const col = BUCKET_COLOR[Math.min(i, BUCKET_COLOR.length - 1)];
              return (
                <div key={b.Rango}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-gray-700">{b.Rango}</span>
                    <span className="text-gray-500">
                      <span className="font-bold text-gray-900">{fmtBs(b.MontoTotal)}</span>
                      {' '}· {b.FacturasCount} fact. · {b.ClientesCount} clientes
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div style={{ width: `${pct}%`, backgroundColor: col, transition: 'width .6s' }} className="h-full rounded-full" />
                  </div>
                </div>
              );
            })}
          </div>
        )
      }
    </SectionCard>
  );
}
