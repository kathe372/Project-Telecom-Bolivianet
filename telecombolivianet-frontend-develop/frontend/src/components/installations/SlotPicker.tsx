import { Loader2 } from 'lucide-react';
import { useAvailableSlots } from '@/hooks/useAvailableSlots';
import type { SlotDisponible } from '@/types/installation.types';

interface Props {
  planId:    string;
  selected?: { fecha: string; horaInicio: string };
  onPick:    (fecha: string, horaInicio: string) => void;
}

/** Punto 8: selector de franjas disponibles (chips por día). */
export default function SlotPicker({ planId, selected, onPick }: Props) {
  const { slots, loading } = useAvailableSlots(planId);
  if (!planId) return null;
  if (loading)
    return <div className="py-3 text-center text-gray-400"><Loader2 className="w-4 h-4 animate-spin inline" /></div>;
  if (slots.length === 0)
    return <p className="text-xs text-gray-400">Sin franjas disponibles en los próximos días.</p>;

  const byDay = slots.reduce<Record<string, SlotDisponible[]>>((acc, s) => {
    (acc[s.fecha] ??= []).push(s); return acc;
  }, {});

  return (
    <div className="space-y-2 max-h-40 overflow-y-auto">
      {Object.entries(byDay).map(([fecha, list]) => (
        <div key={fecha}>
          <p className="text-[11px] font-medium text-gray-500">{fecha}</p>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {list.map(s => {
              const active = selected?.fecha === s.fecha && selected?.horaInicio === s.horaInicio;
              return (
                <button key={s.horaInicio} type="button" disabled={!s.disponible}
                  onClick={() => onPick(s.fecha, s.horaInicio)}
                  className={`px-2 py-1 rounded-md text-xs border ${active
                    ? 'bg-blue-600 text-white border-blue-600'
                    : s.disponible
                      ? 'bg-white text-gray-700 border-gray-200 hover:border-blue-400'
                      : 'bg-gray-100 text-gray-300 border-gray-100 cursor-not-allowed'}`}>
                  {s.horaInicio}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
