import type { ReactNode } from 'react';

type AccentColor = 'blue' | 'amber' | 'red' | 'green' | 'teal' | 'gray' | 'indigo';

const ACCENT_CLASSES: Record<AccentColor, string> = {
  blue:   'border-l-[3px] border-blue-500 bg-gradient-to-br from-blue-50/60 to-white',
  amber:  'border-l-[3px] border-amber-400 bg-gradient-to-br from-amber-50/60 to-white',
  red:    'border-l-[3px] border-red-500 bg-gradient-to-br from-red-50/60 to-white',
  green:  'border-l-[3px] border-green-500 bg-gradient-to-br from-green-50/60 to-white',
  teal:   'border-l-[3px] border-green-400 bg-gradient-to-br from-green-50/60 to-white',
  gray:   'border-l-[3px] border-gray-200 bg-gradient-to-br from-gray-50/40 to-white',
  indigo: 'border-l-[3px] border-indigo-400 bg-gradient-to-br from-indigo-50/60 to-white',
};

export default function KpiCard({ label, value, icon, sub, subColor = 'text-gray-500', accent }: {
  label: string; value: string; icon: ReactNode; sub?: string;
  subColor?: string; accent?: AccentColor;
}) {
  return (
    <div className={`card p-4 flex flex-col gap-2 transition-shadow hover:shadow-md ${
      accent ? ACCENT_CLASSES[accent] : ''
    }`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider leading-tight">{label}</p>
        <div className="p-1.5 rounded-lg bg-white shadow-sm border border-gray-100 shrink-0">{icon}</div>
      </div>
      <p className="text-2xl font-bold text-gray-900 leading-none tabular-nums">{value}</p>
      {sub && <p className={`text-xs ${subColor} leading-none`}>{sub}</p>}
    </div>
  );
}
