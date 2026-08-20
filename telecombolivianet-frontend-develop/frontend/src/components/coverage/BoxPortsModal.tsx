import { useState } from 'react';
import { X, Loader2, LayoutGrid } from 'lucide-react';
import { useBoxPorts } from '@/hooks/useBoxPorts';
import NapPortCell from './NapPortCell';
import NapPortDetail from './NapPortDetail';
import ConfirmDialog, { type ConfirmState, CONFIRM_CLOSED } from '@/components/shared/ConfirmDialog';
import type { DistributionBox } from '@/types/coverage';

interface Props {
  box:       DistributionBox;
  onChanged: () => void;   // refresca la caja en el mapa (cambia PuertosTotal)
  onClose:   () => void;
}

/** PR-4b: modal de puertos de una caja (grilla patch-panel + detalle + dañar/reparar). */
export default function BoxPortsModal({ box, onChanged, onClose }: Props) {
  const { ports, loading, error, damage, repair } = useBoxPorts(box.id);
  const [sel, setSel] = useState(1);
  const [confirm, setConfirm] = useState<ConfirmState>(CONFIRM_CLOSED);
  const [running, setRunning] = useState(false);
  const selected = ports.find(p => p.numero === sel) ?? ports[0];

  const askDamage = (numero: number) => setConfirm({
    open: true, variant: 'danger', title: `Dañar puerto ${numero}`,
    message: 'El puerto saldrá de la capacidad usable de la caja hasta repararlo.',
    confirmLabel: 'Marcar dañado',
    onConfirm: async () => {
      setRunning(true);
      try { await damage(numero); onChanged(); setConfirm(CONFIRM_CLOSED); }
      finally { setRunning(false); }
    },
  });
  const doRepair = async (numero: number) => { await repair(numero); onChanged(); };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div role="dialog" aria-modal="true" onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
          className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <LayoutGrid className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Puertos · {box.codigo}</h3>
            <span className="text-xs text-gray-500 ml-2">
              {box.puertosOcupados} ocup · {box.puertosReservados} reserv · {box.puertosLibres} libre(s) / {box.puertosTotal}
            </span>
            <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600" aria-label="Cerrar">
              <X className="w-4 h-4" />
            </button>
          </div>

          {loading && (
            <div className="py-10 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
          )}
          {error && <p className="text-sm text-red-600 py-4">{error}</p>}

          {!loading && !error && (
            <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr] gap-5">
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {ports.map(p => (
                  <NapPortCell key={p.numero} port={p} selected={p.numero === sel} onSelect={setSel} />
                ))}
              </div>
              {selected && <NapPortDetail port={selected} onDamage={askDamage} onRepair={doRepair} />}
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(CONFIRM_CLOSED)} running={running} />
    </>
  );
}
