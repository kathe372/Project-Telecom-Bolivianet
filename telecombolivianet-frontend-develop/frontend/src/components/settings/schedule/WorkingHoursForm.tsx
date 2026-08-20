import { useState } from 'react';
import { businessScheduleService } from '@/services/businessScheduleService';
import { extractApiError } from '@/utils/apiError';
import { WEEK_DAYS, type BusinessSchedule } from '@/types/businessSchedule';

interface Props { schedule: BusinessSchedule | null; onSaved: () => void; }

/** Punto 1: editor de horario semanal (días laborales + hora inicio/fin + 24×7). */
export default function WorkingHoursForm({ schedule, onSaved }: Props) {
  const [name, setName]   = useState(schedule?.name ?? 'Horario de atención');
  const [mask, setMask]   = useState(schedule?.workingDaysMask ?? 31);
  const [start, setStart] = useState(schedule?.startHour ?? 8);
  const [end, setEnd]     = useState(schedule?.endHour ?? 18);
  const [is24, setIs24]   = useState(schedule?.is24x7 ?? false);
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState('');
  const toggle = (bit: number) => setMask(m => (m & bit) ? m & ~bit : m | bit);

  const save = async () => {
    setBusy(true); setErr('');
    const dto = {
      name, timeZoneName: schedule?.timeZoneName ?? 'America/La_Paz',
      utcOffsetHours: schedule?.utcOffsetHours ?? -4, workingDaysMask: mask,
      startHour: start, endHour: end, is24x7: is24, isDefault: schedule?.isDefault ?? true,
    };
    try {
      if (schedule) await businessScheduleService.update(schedule.id, dto);
      else await businessScheduleService.create(dto);
      onSaved();
    } catch (e) { setErr(extractApiError(e, 'No se pudo guardar el horario.')); }
    finally { setBusy(false); }
  };

  return (
    <div className="card p-4 space-y-4">
      <div>
        <label className="label text-xs">Nombre</label>
        <input className="input-field text-sm" value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div>
        <label className="label text-xs">Días laborales</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {WEEK_DAYS.map(d => (
            <button key={d.bit} type="button" onClick={() => toggle(d.bit)}
              className={`px-3 py-1 rounded-lg text-xs font-medium border ${(mask & d.bit)
                ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-3 items-end">
        <div><label className="label text-xs">Desde (h)</label>
          <input type="number" min={0} max={23} className="input-field text-sm w-24" value={start}
            onChange={e => setStart(Number(e.target.value))} disabled={is24} /></div>
        <div><label className="label text-xs">Hasta (h)</label>
          <input type="number" min={1} max={24} className="input-field text-sm w-24" value={end}
            onChange={e => setEnd(Number(e.target.value))} disabled={is24} /></div>
        <label className="flex items-center gap-2 text-xs text-gray-600 pb-2">
          <input type="checkbox" checked={is24} onChange={e => setIs24(e.target.checked)} /> 24×7
        </label>
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <button onClick={save} disabled={busy} className="btn-primary text-sm">
        {busy ? 'Guardando…' : 'Guardar horario'}
      </button>
    </div>
  );
}
