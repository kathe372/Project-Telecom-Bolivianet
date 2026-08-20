import { useState } from 'react';
import { Ticket, Zap, Clock, AlertTriangle, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import SectionCard from './SectionCard';
import DonutChart from './DonutChart';
import { SkeletonChart, SkeletonTable, ErrorSection } from './SkeletonCard';
import { fmtDate, timeAgo, PRIO_BADGE, STATUS_BADGE, ESTADO_DOT, TIPO_COLOR } from '@/utils/dashboardFormatters';
import { downloadCsv } from '@/utils/exportUtils';
import type {
  TicketEstadoDashDto, TicketDashItemDto, TicketPorTipoDto, ResolucionPromDto,
} from '@/services/dashboardService';

type Status = 'loading' | 'error' | 'success';

interface Props {
  tEst: TicketEstadoDashDto[] | null;  tEstS: Status;  tEstR: () => void;
  tUrg: TicketDashItemDto[] | null;    tUrgS: Status;  tUrgR: () => void;
  tTipo: TicketPorTipoDto[] | null;    tTipoS: Status; tTipoR: () => void;
  tResol: ResolucionPromDto[] | null;  tResolS: Status; tResolR: () => void;
}

const COLLAPSED_ROWS = 4;

export default function DashboardTicketsPanel(props: Props) {
  const { tEst, tEstS, tEstR, tUrg, tUrgS, tUrgR, tTipo, tTipoS, tTipoR, tResol, tResolS, tResolR } = props;
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  const estadoSlices = (tEst ?? []).map(t => ({
    label: t.Estado, value: t.Total, color: ESTADO_DOT[t.Estado] ?? '#9ca3af',
  }));
  const tipoSlices = (tTipo ?? []).slice(0, 5).map(t => ({
    label: t.Tipo, value: t.Total, color: TIPO_COLOR[t.Tipo] ?? '#9ca3af',
  }));

  const urgRows = tUrg ?? [];
  const shownRows = expanded ? urgRows : urgRows.slice(0, COLLAPSED_ROWS);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest px-3">Panel de Tickets</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {}
        <div>
          {tEstS === 'loading' && <SkeletonChart />}
          {tEstS === 'error' && <ErrorSection title="Error cargando estados." onRetry={tEstR} />}
          {tEstS === 'success' && tEst && (
            <SectionCard title="Por Estado"
              icon={<Ticket className="w-4 h-4 text-blue-500" />}
              badge="Ver todos →" onBadgeClick={() => navigate('/tickets')}>
              <div className="flex flex-col items-center gap-3">
                <DonutChart slices={estadoSlices} size={100} label="total" />
                <div className="w-full space-y-1.5">
                  {tEst.map((t, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs">
                      <span className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: ESTADO_DOT[t.Estado] ?? '#9ca3af', display: 'inline-block' }} />
                      <span className="text-gray-700 flex-1">{t.Estado}</span>
                      <span className="font-bold text-gray-900">{t.Total}</span>
                      {t.Criticos > 0 && <span className="text-red-500">({t.Criticos}⚠)</span>}
                    </div>
                  ))}
                </div>
              </div>
            </SectionCard>
          )}
        </div>

        {}
        <div>
          {tTipoS === 'loading' && <SkeletonChart />}
          {tTipoS === 'error' && <ErrorSection title="Error cargando tipos." onRetry={tTipoR} />}
          {tTipoS === 'success' && tTipo && (
            <SectionCard title="Por Tipo" icon={<Zap className="w-4 h-4 text-purple-500" />}>
              <div className="flex flex-col items-center gap-3">
                <DonutChart slices={tipoSlices} size={100} />
                <div className="w-full space-y-1.5">
                  {(tTipo ?? []).slice(0, 5).map((t, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs">
                      <span className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: TIPO_COLOR[t.Tipo] ?? '#9ca3af', display: 'inline-block' }} />
                      <span className="text-gray-700 flex-1 truncate">{t.Tipo.replace(/([A-Z])/g, ' $1').trim()}</span>
                      <span className="font-bold text-gray-900">{t.Total}</span>
                    </div>
                  ))}
                </div>
              </div>
            </SectionCard>
          )}
        </div>

        {}
        <div>
          {tResolS === 'loading' && <SkeletonChart />}
          {tResolS === 'error' && <ErrorSection title="Error cargando tiempos." onRetry={tResolR} />}
          {tResolS === 'success' && tResol && (
            <SectionCard title="Resolución Promedio"
              icon={<Clock className="w-4 h-4 text-amber-500" />}>
              {tResol.length === 0
                ? <p className="text-sm text-gray-400 text-center py-8">Sin tickets resueltos aún</p>
                : (
                  <div className="space-y-3">
                    {tResol.map((r, i) => {
                      const h    = Math.round(r.HorasPromedio);
                      const maxH = Math.max(...tResol.map(x => x.HorasPromedio), 1);
                      const pct  = (r.HorasPromedio / maxH) * 100;
                      const col  = r.Prioridad === 'Critica' ? '#ef4444'
                        : r.Prioridad === 'Alta'   ? '#f97316'
                        : r.Prioridad === 'Media'  ? '#f59e0b' : '#6b7280';
                      return (
                        <div key={i}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-medium text-gray-700">{r.Prioridad}</span>
                            <span className="text-gray-500">
                              <span className="font-bold text-gray-900">{h < 24 ? `${h}h` : `${Math.round(h / 24)}d`}</span>
                              {' '}prom · {r.Cantidad} tickets
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
          )}
        </div>
      </div>

      {}
      <div>
        {tUrgS === 'loading' && <SkeletonTable />}
        {tUrgS === 'error' && <ErrorSection title="Error cargando tickets urgentes." onRetry={tUrgR} />}
        {tUrgS === 'success' && tUrg && (
          <SectionCard
            title="Tickets Activos — Prioridad Crítica/Alta primero"
            icon={<AlertTriangle className="w-4 h-4 text-orange-500" />}
            badge={`Ver todos (${tUrg.length}) →`}
            onBadgeClick={() => navigate('/tickets')}
            headerAction={
              <button
                onClick={() => downloadCsv(
                  tUrg.map(t => ({
                    Ticket: t.Asunto, Cliente: t.ClienteNombre, Tipo: t.Tipo,
                    Prioridad: t.Prioridad, Estado: t.Estado, Técnico: t.Tecnico,
                    'Creado': t.CreadoEn, 'SLA Vencido': t.SlaVencido ? 'Sí' : 'No',
                  })),
                  'tickets_urgentes'
                )}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Exportar
              </button>
            }
          >
            {urgRows.length === 0
              ? <p className="text-sm text-gray-400 text-center py-8">✅ No hay tickets activos</p>
              : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-400 border-b border-gray-100">
                          {['Cliente', 'Asunto', 'Tipo', 'Prioridad', 'Estado', 'Técnico', 'Abierto', 'Vence'].map(h => (
                            <th key={h} className="text-left py-2 pr-3 font-medium whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {shownRows.map(t => (
                          <tr key={t.Id}
                            className={`border-b border-gray-50 hover:bg-gray-50 cursor-pointer ${t.SlaVencido ? 'bg-red-50/40' : ''}`}
                            onClick={() => navigate('/tickets')}>
                            <td className="py-2 pr-3 font-medium text-gray-800 truncate max-w-[110px]">{t.ClienteNombre}</td>
                            <td className="py-2 pr-3 text-gray-600 truncate max-w-[130px]">{t.Asunto}</td>
                            <td className="py-2 pr-3 text-gray-500 whitespace-nowrap">{t.Tipo.replace(/([A-Z])/g, ' $1').trim()}</td>
                            <td className="py-2 pr-3">
                              <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${PRIO_BADGE[t.Prioridad] ?? 'bg-gray-100'}`}>
                                {t.Prioridad}
                              </span>
                            </td>
                            <td className="py-2 pr-3">
                              <span className={`px-1.5 py-0.5 rounded text-xs ${STATUS_BADGE[t.Estado] ?? ''}`}>
                                {t.Estado}
                              </span>
                            </td>
                            <td className="py-2 pr-3 text-gray-500 truncate max-w-[90px]">{t.Tecnico}</td>
                            <td className="py-2 pr-3 text-gray-400 whitespace-nowrap">{timeAgo(t.CreadoEn)}</td>
                            <td className="py-2">
                              {t.SlaVencido
                                ? <span className="text-red-600 font-bold text-xs">🔴 VENCIDO</span>
                                : t.FechaLimite
                                ? <span className="text-gray-500 text-xs">{fmtDate(t.FechaLimite)}</span>
                                : <span className="text-gray-300">—</span>
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {urgRows.length > COLLAPSED_ROWS && (
                    <button
                      onClick={() => setExpanded(v => !v)}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:underline mt-2 mx-auto"
                    >
                      {expanded
                        ? <>Ver menos <ChevronUp className="w-3 h-3" /></>
                        : <>Ver {urgRows.length - COLLAPSED_ROWS} más <ChevronDown className="w-3 h-3" /></>}
                    </button>
                  )}
                </>
              )
            }
          </SectionCard>
        )}
      </div>
    </div>
  );
}
