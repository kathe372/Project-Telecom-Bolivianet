import {
  AlertCircle, Clock, CheckCircle, XCircle, AlertTriangle, Plus,
} from 'lucide-react';
import type { TicketKpiDto } from '@/types/ticket.types';

export const PRIORITY_COLORS: Record<string, string> = {
  Critica: 'bg-red-500',
  Alta:    'bg-orange-400',
  Media:   'bg-yellow-400',
  Baja:    'bg-blue-400',
};

export function fmtMinutes(m: number): string {
  if (m < 60)   return `${Math.round(m)}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;
  return `${Math.round(m / 1440)}d`;
}

export function TicketKpiCards({ kpi }: { kpi: TicketKpiDto }) {
  const totalSla = kpi.SlaCompliantCount + kpi.SlaBreachedCount;
  const slaGlobal = totalSla > 0
    ? Math.round(kpi.SlaCompliantCount / totalSla * 100)
    : null;

  return (
    <div className="space-y-3 mb-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Abiertos',    value: kpi.TotalOpen,      icon: AlertCircle,   color: 'text-blue-500' },
          { label: 'En proceso',  value: kpi.TotalInProcess, icon: Clock,         color: 'text-yellow-500' },
          { label: 'Resueltos',   value: kpi.TotalResolved,  icon: CheckCircle,   color: 'text-green-500' },
          { label: 'Cerrados',    value: kpi.TotalClosed,    icon: XCircle,       color: 'text-gray-400' },
          { label: 'SLA Vencido', value: kpi.OverdueSla,     icon: AlertTriangle, color: 'text-red-500' },
          { label: 'Hoy',         value: kpi.CreatedToday,   icon: Plus,          color: 'text-indigo-500' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card p-3 flex items-center gap-3">
            <Icon className={`w-5 h-5 shrink-0 ${color}`} />
            <div>
              <p className="text-xl font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {(slaGlobal !== null || kpi.AvgResolutionMinutes !== null || kpi.AvgFirstResponseMinutes !== null) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

          {slaGlobal !== null && (
            <div className="card p-3">
              <p className="text-xs text-gray-500 mb-2">Cumplimiento SLA global</p>
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all"
                    style={{ width: `${slaGlobal}%` }}
                  />
                </div>
                <span className="text-sm font-bold text-gray-700">{slaGlobal}%</span>
              </div>
              <p className="text-xs text-gray-400">
                {kpi.SlaCompliantCount} cumplidos · {kpi.SlaBreachedCount} incumplidos
              </p>
            </div>
          )}

          {kpi.SlaByPriority?.length > 0 && (
            <div className="card p-3">
              <p className="text-xs text-gray-500 mb-2">SLA por prioridad</p>
              <div className="space-y-1.5">
                {kpi.SlaByPriority.map((p) => {
                  const tot = p.Compliant + p.Breached;
                  const pct = tot > 0 ? Math.round(p.Compliant / tot * 100) : 0;
                  return (
                    <div key={p.Priority} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-12 shrink-0">{p.Priority}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                        <div
                          className={`${PRIORITY_COLORS[p.Priority] ?? 'bg-gray-400'} h-1.5 rounded-full`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-gray-700 w-8 text-right">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {(kpi.AvgResolutionMinutes !== null || kpi.AvgFirstResponseMinutes !== null) && (
            <div className="card p-3">
              <p className="text-xs text-gray-500 mb-2">Tiempos promedio</p>
              <div className="space-y-2">
                {kpi.AvgResolutionMinutes !== null && (
                  <div>
                    <p className="text-xs text-gray-400">MTTR (resolución)</p>
                    <p className="text-base font-bold text-gray-800">
                      {fmtMinutes(kpi.AvgResolutionMinutes)}
                    </p>
                  </div>
                )}
                {kpi.AvgFirstResponseMinutes !== null && (
                  <div>
                    <p className="text-xs text-gray-400">MTTA (1ª respuesta)</p>
                    <p className="text-base font-bold text-gray-800">
                      {fmtMinutes(kpi.AvgFirstResponseMinutes)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
