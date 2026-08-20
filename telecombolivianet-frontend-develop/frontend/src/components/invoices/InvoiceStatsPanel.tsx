import { type ReactNode, useState } from 'react';
import { TrendingUp, CheckCircle, Users, AlertTriangle, Calendar, CalendarRange } from 'lucide-react';
import { MONTHS, fmtBsDec } from '@/utils/invoiceFormatters';
import type { InvoiceMonthStatsDto, InvoiceRangeStatsDto, DebtorDto } from '@/types/invoice.types';

function StatCard({ label, value, sub, icon, color }: {
  label: string; value: string; sub?: string;
  icon: ReactNode; color: string;
}) {
  return (
    <div className="card p-4 flex items-start gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-500 mb-0.5">{label}</p>
        <p className="text-lg font-bold text-gray-900">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

interface StatsNormalized {
  TotalBilled:    number;
  TotalCollected: number;
  TotalPending:   number;
  CountBilled:    number;
  CountCollected: number;
  CollectionRate: number;
}

function normalize(
  stats: InvoiceMonthStatsDto | InvoiceRangeStatsDto | null,
): StatsNormalized | null {
  if (!stats) return null;
  return {
    TotalBilled:    stats.TotalBilled,
    TotalCollected: stats.TotalCollected,
    TotalPending:   stats.TotalPending,
    CountBilled:    stats.CountBilled,
    CountCollected: stats.CountCollected,
    CollectionRate: stats.CollectionRate,
  };
}

interface InvoiceStatsPanelProps {
  stats:         InvoiceMonthStatsDto | null;
  rangeStats:    InvoiceRangeStatsDto | null;
  debtors:      DebtorDto[];
  totalDeuda:    number;
  totalOverdue: number;
  statsMonth:    number;
  statsYear:     number;
  onMonthChange: (m: number) => void;
  onYearChange:  (y: number) => void;
  rangeFrom:     string;
  rangeTo:       string;
  onRangeFromChange: (d: string) => void;
  onRangeToChange:   (d: string) => void;
}

export function InvoiceStatsPanel({
  stats, rangeStats, debtors, totalDeuda, totalOverdue,
  statsMonth, statsYear, onMonthChange, onYearChange,
  rangeFrom, rangeTo, onRangeFromChange, onRangeToChange,
}: InvoiceStatsPanelProps) {
  const [mode, setMode] = useState<'month' | 'range'>('month');

  const normalized = normalize(mode === 'month' ? stats : rangeStats);
  const rate = normalized?.CollectionRate ?? 0;

  return (
    <div className="card p-4 mb-5">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {}
        <div className="flex items-center bg-gray-100 rounded-lg p-1 shrink-0">
          <button
            onClick={() => setMode('month')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors
              ${mode === 'month' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Calendar className="w-3.5 h-3.5" /> Mes
          </button>
          <button
            onClick={() => setMode('range')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors
              ${mode === 'range' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <CalendarRange className="w-3.5 h-3.5" /> Rango
          </button>
        </div>

        {mode === 'month' ? (
          <>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Mes:</span>
            <select
              className="input-field w-36 py-1 text-sm"
              value={statsMonth}
              onChange={e => onMonthChange(parseInt(e.target.value))}
            >
              {MONTHS.slice(1).map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
            <input
              type="number"
              className="input-field w-20 py-1 text-sm"
              value={statsYear}
              min={2024}
              max={2100}
              onChange={e => onYearChange(parseInt(e.target.value))}
            />
          </>
        ) : (
          <>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Desde:</span>
            <input
              type="date"
              className="input-field py-1 text-sm"
              value={rangeFrom}
              onChange={e => onRangeFromChange(e.target.value)}
            />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Hasta:</span>
            <input
              type="date"
              className="input-field py-1 text-sm"
              value={rangeTo}
              onChange={e => onRangeToChange(e.target.value)}
            />
          </>
        )}
      </div>

      {normalized && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Total facturado"
            icon={<TrendingUp className="w-4 h-4 text-blue-600" />} color="bg-blue-100"
            value={fmtBsDec(normalized.TotalBilled)}
            sub={`${normalized.CountBilled} facturas`}
          />
          <StatCard
            label="Total cobrado"
            icon={<CheckCircle className="w-4 h-4 text-green-600" />} color="bg-green-100"
            value={fmtBsDec(normalized.TotalCollected)}
            sub={`${rate}% tasa de cobranza`}
          />
          <StatCard
            label="Clientes con deuda"
            icon={<Users className="w-4 h-4 text-amber-600" />} color="bg-amber-100"
            value={`${debtors.length}`}
            sub={`${totalOverdue} facturas vencidas`}
          />
          <StatCard
            label="Deuda total pendiente"
            icon={<AlertTriangle className="w-4 h-4 text-red-500" />} color="bg-red-100"
            value={fmtBsDec(totalDeuda)}
            sub={rate >= 80 ? 'Buen rendimiento' : 'Requiere atención'}
          />
        </div>
      )}
    </div>
  );
}
