import { useState } from 'react';
import { Loader2, Clock } from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useBusinessSchedules } from '@/hooks/useBusinessSchedules';
import WorkingHoursForm from '@/components/settings/schedule/WorkingHoursForm';
import HolidayList from '@/components/settings/schedule/HolidayList';

/** Punto 1: configuración de horarios de negocio + feriados (alimenta el SLA). */
export default function BusinessSchedulePage() {
  usePageTitle('Horarios y feriados');
  const { schedules, loading, error, refresh } = useBusinessSchedules();
  const [selId, setSelId] = useState<string | null>(null);
  const selected = schedules.find(s => s.id === selId) ?? schedules[0] ?? null;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Clock className="w-5 h-5 text-blue-600" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Horarios y feriados</h1>
          <p className="text-sm text-gray-500 mt-0.5">Horario de atención que usa el cálculo de SLA.</p>
        </div>
      </div>

      {loading && (
        <div className="py-16 text-center text-gray-400"><Loader2 className="w-6 h-6 animate-spin inline" /></div>
      )}
      {error && <p className="text-sm text-red-600 py-4">{error}</p>}

      {!loading && !error && (
        <div className="space-y-5">
          {schedules.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {schedules.map(s => (
                <button key={s.id} onClick={() => setSelId(s.id)}
                  className={`px-3 py-1 rounded-lg text-xs ${selected?.id === s.id
                    ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
                  {s.name}{s.isDefault ? ' ★' : ''}
                </button>
              ))}
            </div>
          )}
          <WorkingHoursForm key={selected?.id ?? 'new'} schedule={selected} onSaved={refresh} />
          {selected && <HolidayList schedule={selected} onChanged={refresh} />}
        </div>
      )}
    </div>
  );
}
