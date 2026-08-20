import { useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { businessScheduleService } from '@/services/businessScheduleService';
import type { BusinessSchedule } from '@/types/businessSchedule';

interface Props { schedule: BusinessSchedule; onChanged: () => void; }

/** Punto 1: lista de feriados del horario (agregar / quitar). */
export default function HolidayList({ schedule, onChanged }: Props) {
  const [date, setDate] = useState('');
  const [name, setName] = useState('');

  const add = async () => {
    if (!date || !name) return;
    await businessScheduleService.addHoliday(schedule.id, date, name);
    setDate(''); setName(''); onChanged();
  };
  const remove = async (holidayId: string) => {
    await businessScheduleService.removeHoliday(schedule.id, holidayId);
    onChanged();
  };

  return (
    <div className="card p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-900">Feriados</h3>
      <div className="flex flex-wrap gap-2 items-end">
        <input type="date" className="input-field text-sm" value={date} onChange={e => setDate(e.target.value)} />
        <input className="input-field text-sm" placeholder="Nombre" value={name} onChange={e => setName(e.target.value)} />
        <button onClick={add} disabled={!date || !name} className="btn-secondary text-sm disabled:opacity-50">
          <Plus className="w-4 h-4" /> Agregar
        </button>
      </div>
      {schedule.holidays.length === 0
        ? <p className="text-xs text-gray-400">Sin feriados cargados.</p>
        : (
          <ul className="divide-y divide-gray-100">
            {schedule.holidays.map(h => (
              <li key={h.id} className="flex items-center justify-between py-2 text-sm">
                <span><span className="font-mono text-xs text-gray-500">{h.date}</span> · {h.name}</span>
                <button onClick={() => remove(h.id)} className="p-1 text-gray-400 hover:text-red-600" title="Quitar feriado">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
