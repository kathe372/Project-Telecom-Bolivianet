import { Receipt, Download } from 'lucide-react';
import SectionCard from './SectionCard';
import { SkeletonTable, ErrorSection } from './SkeletonCard';
import { fmtBs, fmtTime } from '@/utils/dashboardFormatters';
import { downloadCsv } from '@/utils/exportUtils';
import type { RecentReceipt } from '@/services/dashboardService';

type Status = 'loading' | 'error' | 'success';

export default function DashboardReceipts({ comprob, status, onRetry }: {
  comprob: RecentReceipt[] | null; status: Status; onRetry: () => void;
}) {
  if (status === 'loading') return <SkeletonTable />;
  if (status === 'error') return <ErrorSection title="Error cargando pagos." onRetry={onRetry} />;
  if (!comprob) return null;

  return (
    <SectionCard
      title="Últimos Pagos Verificados"
      icon={<Receipt className="w-4 h-4 text-blue-500" />}
      badge={`${comprob.length} registros`}
      headerAction={
        <button
          onClick={() => downloadCsv(
            comprob.map(c => ({
              Cliente: c.ClienteNombre, 'Monto (Bs)': c.Monto,
              Fecha: c.FechaPago, Estado: c.Estado, Método: c.Metodo,
            })),
            'pagos'
          )}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 transition-colors"
        >
          <Download className="w-3.5 h-3.5" /> Exportar
        </button>
      }
    >
      {comprob.length === 0
        ? <p className="text-sm text-gray-400 text-center py-6">Sin pagos recientes</p>
        : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {comprob.map(c => (
              <div key={c.Id}
                className="flex flex-col gap-1 p-3 rounded-xl bg-gray-50 border border-gray-100 hover:border-blue-200 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-green-700">{fmtBs(c.Monto)}</span>
                  <span className="text-xs text-gray-400 font-mono">{fmtTime(c.FechaPago)}</span>
                </div>
                <p className="text-xs font-medium text-gray-800 truncate">{c.ClienteNombre}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">{c.Metodo.replace('DepositoBancario', 'Dep.')}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700">{c.Estado}</span>
                </div>
              </div>
            ))}
          </div>
        )
      }
    </SectionCard>
  );
}
