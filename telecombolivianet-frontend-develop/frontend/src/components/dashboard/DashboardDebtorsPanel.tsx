import { useState } from 'react';
import { XCircle, Download, ChevronDown, ChevronUp } from 'lucide-react';
import SectionCard from './SectionCard';
import { SkeletonTable, ErrorSection } from './SkeletonCard';
import { fmtBs } from '@/utils/dashboardFormatters';
import { downloadCsv } from '@/utils/exportUtils';
import type { DebtorItem } from '@/services/dashboardService';

type Status = 'loading' | 'error' | 'success';

interface Props {
  debtors: DebtorItem[] | null; deudS: Status; deudR: () => void;
}

const COLLAPSED_ROWS = 4;

export default function DashboardDebtorsPanel({ debtors, deudS, deudR }: Props) {
  const [expanded, setExpanded] = useState(false);
  const rows = debtors ?? [];
  const shownRows = expanded ? rows : rows.slice(0, COLLAPSED_ROWS);

  return (
    <div>
      {deudS === 'loading' && <SkeletonTable />}
      {deudS === 'error' && <ErrorSection title="Error cargando deudores." onRetry={deudR} />}
      {deudS === 'success' && debtors && (
        <SectionCard
          title="Clientes con Deuda Vencida"
          icon={<XCircle className="w-4 h-4 text-red-500" />}
          badge={`${debtors.length} clientes`}
          headerAction={
            <button
              onClick={() => downloadCsv(
                debtors.map(d => ({
                  Cliente: d.ClienteNombre, Zona: d.Zona,
                  'Monto Deuda (Bs)': d.MontoDeuda,
                  'Días Vencido': d.DiasVencido,
                  'Facturas Vencidas': d.FacturasVencidas,
                })),
                'deudores'
              )}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Exportar
            </button>
          }
        >
          {rows.length === 0
            ? <p className="text-sm text-gray-400 text-center py-8">✅ Sin deudas overdue</p>
            : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400 border-b border-gray-100">
                        <th className="text-left py-2 pr-2 font-medium">Cliente</th>
                        <th className="text-left py-2 pr-2 font-medium">Zona</th>
                        <th className="text-right py-2 pr-2 font-medium">Deuda</th>
                        <th className="text-right py-2 pr-2 font-medium">Días</th>
                        <th className="text-right py-2 font-medium">Fact.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shownRows.map(d => (
                        <tr key={d.ClienteId} className="border-b border-gray-50 hover:bg-red-50/30">
                          <td className="py-2 pr-2 font-medium text-gray-800 truncate max-w-[100px]">{d.ClienteNombre}</td>
                          <td className="py-2 pr-2 text-gray-500 truncate max-w-[70px]">{d.Zona}</td>
                          <td className="py-2 pr-2 text-right font-bold text-red-600">{fmtBs(d.MontoDeuda)}</td>
                          <td className="py-2 pr-2 text-right">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                              d.DiasVencido > 60 ? 'bg-red-100 text-red-800'
                              : d.DiasVencido > 30 ? 'bg-orange-100 text-orange-700'
                              : 'bg-yellow-50 text-yellow-700'}`}>
                              {d.DiasVencido}d
                            </span>
                          </td>
                          <td className="py-2 text-right text-gray-400">{d.FacturasVencidas}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {rows.length > COLLAPSED_ROWS && (
                  <button
                    onClick={() => setExpanded(v => !v)}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:underline mt-2 mx-auto"
                  >
                    {expanded
                      ? <>Ver menos <ChevronUp className="w-3 h-3" /></>
                      : <>Ver {rows.length - COLLAPSED_ROWS} más <ChevronDown className="w-3 h-3" /></>}
                  </button>
                )}
              </>
            )
          }
        </SectionCard>
      )}
    </div>
  );
}
