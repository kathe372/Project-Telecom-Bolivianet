import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, X, ChevronRight, Timer, FileCheck, WifiOff } from 'lucide-react';
import type { DashboardKpisDto } from '@/services/dashboardService';

interface Props { kpis: DashboardKpisDto; }

interface Alert {
  key:    string;
  level:  'critical' | 'warning' | 'ok';
  label:  string;
  detail: string;
  to?:    string;
}

function buildAlerts(kpis: DashboardKpisDto): Alert[] {
  const alerts: Alert[] = [];

  if (kpis.TicketsSlaVencidos > 0) {
    alerts.push({
      key:    'sla',
      level:  kpis.TicketsSlaVencidos >= 3 ? 'critical' : 'warning',
      label:  `${kpis.TicketsSlaVencidos} SLA vencido${kpis.TicketsSlaVencidos > 1 ? 's' : ''}`,
      detail: 'Tickets fuera de plazo',
      to:     '/tickets',
    });
  }
  if (kpis.ClientesSuspendidos > 0) {
    alerts.push({
      key:    'susp',
      level:  'warning',
      label:  `${kpis.ClientesSuspendidos} cliente${kpis.ClientesSuspendidos > 1 ? 's' : ''} suspendido${kpis.ClientesSuspendidos > 1 ? 's' : ''}`,
      detail: 'Sin servicio activo',
      to:     '/clients',
    });
  }
  if (kpis.TicketsCriticos > 0) {
    alerts.push({
      key:    'crit',
      level:  'critical',
      label:  `${kpis.TicketsCriticos} ticket${kpis.TicketsCriticos > 1 ? 's' : ''} crítico${kpis.TicketsCriticos > 1 ? 's' : ''}`,
      detail: 'Prioridad máxima',
      to:     '/tickets',
    });
  }

  return alerts;
}

function healthScore(alerts: Alert[]): number {
  const deductions = alerts.reduce((acc, a) => acc + (a.level === 'critical' ? 15 : a.level === 'warning' ? 6 : 2), 0);
  return Math.max(0, 100 - deductions);
}


const ALERT_ICONS: Record<string, React.ReactNode> = {
  sla:  <Timer    className="w-3.5 h-3.5" />,
  comp: <FileCheck className="w-3.5 h-3.5" />,
  susp: <WifiOff  className="w-3.5 h-3.5" />,
  crit: <AlertTriangle className="w-3.5 h-3.5" />,
};


export default function SystemHealthBanner({ kpis }: Props) {
  const navigate  = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const alerts  = buildAlerts(kpis);
  const score   = healthScore(alerts);
  const hasCrit = alerts.some(a => a.level === 'critical');
  const allGood = alerts.length === 0;

  const bannerBg = hasCrit
    ? 'bg-red-50 border-red-200'
    : allGood
    ? 'bg-green-50 border-green-200'
    : 'bg-amber-50 border-amber-200';

  const scoreColor = score >= 90 ? 'text-green-700' : score >= 70 ? 'text-amber-700' : 'text-red-700';
  const barColor   = score >= 90 ? 'bg-green-500'   : score >= 70 ? 'bg-amber-400'   : 'bg-red-500';

  return (
    <div className={`rounded-xl border px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 ${bannerBg}`}>
      {}
      <div className="flex items-center gap-3 shrink-0">
        {allGood
          ? <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
          : <AlertTriangle className={`w-5 h-5 shrink-0 ${hasCrit ? 'text-red-500' : 'text-amber-500'}`} />
        }
        <div>
          <p className={`text-sm font-bold leading-none ${scoreColor}`}>
            Sistema al {score}%
          </p>
          <div className="mt-1 w-24 h-1.5 rounded-full bg-white/60 overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${score}%` }} />
          </div>
        </div>
      </div>

      {}
      {!allGood && <div className="hidden sm:block w-px h-8 bg-current opacity-10" />}

      {}
      {allGood ? (
        <p className="text-sm text-green-700 flex-1">
          Todo operando normalmente — sin alertas activas.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2 flex-1">
          {alerts.map(a => (
            <button
              key={a.key}
              onClick={() => a.to && navigate(a.to)}
              title={a.detail}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-opacity hover:opacity-80 ${
                a.level === 'critical'
                  ? 'bg-red-100 text-red-700'
                  : a.level === 'warning'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {ALERT_ICONS[a.key]}
              {a.label}
              {a.to && <ChevronRight className="w-3 h-3 opacity-60" />}
            </button>
          ))}
        </div>
      )}

      {}
      <button
        onClick={() => setDismissed(true)}
        aria-label="Cerrar banner"
        className="self-start sm:self-auto p-1 rounded-md opacity-40 hover:opacity-70 transition-opacity"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
