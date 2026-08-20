import { Plus, Pencil, Trash2, LayoutGrid } from 'lucide-react';
import type { DistributionBox, DistributionBoxStatus } from '@/types/coverage';

const STATUS_BADGE: Record<DistributionBoxStatus, string> = {
  Activo:       'bg-green-100 text-green-800',
  Saturado:     'bg-red-100 text-red-700',
  Mantenimiento:'bg-amber-100 text-amber-800',
};

interface Props {
  boxes:        DistributionBox[];
  onNewBox:     () => void;
  onEdit:       (box: DistributionBox) => void;
  onDelete:     (box: DistributionBox) => void;
  onViewPorts?: (box: DistributionBox) => void;
  isAdmin?:     boolean;
}

function CapacityBar({ box }: { box: DistributionBox }) {
  const usedPct  = box.puertosTotal > 0 ? (box.puertosOcupados / box.puertosTotal) * 100 : 0;
  const resvPct  = box.puertosTotal > 0 ? (box.puertosReservados / box.puertosTotal) * 100 : 0;

  return (
    <div className="mt-1">
      <div className="flex h-2 rounded-full overflow-hidden bg-gray-200">
        <div className="bg-blue-500 transition-all"  style={{ width: `${usedPct}%` }} />
        <div className="bg-amber-400 transition-all" style={{ width: `${resvPct}%` }} />
      </div>
      <p className="text-[10px] text-gray-500 mt-0.5">
        {box.puertosOcupados} ocup · {box.puertosReservados} reserv · {box.puertosLibres} libre(s) / {box.puertosTotal}
      </p>
    </div>
  );
}

export default function BoxPanel({ boxes, onNewBox, onEdit, onDelete, onViewPorts, isAdmin = true }: Props) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-900">Cajas NAP</h2>
        {isAdmin && (
          <button
            onClick={onNewBox}
            className="flex items-center gap-1 text-xs bg-blue-600 text-white px-2 py-1 rounded-md hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-3 h-3" /> Nueva
          </button>
        )}
      </div>

      {boxes.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-6 px-4">
          Sin cajas en esta zona. Haz clic en "Nueva" y coloca un pin en el mapa.
        </p>
      )}

      <div className="divide-y divide-gray-100">
        {boxes.map(box => (
          <div key={box.id} className="px-4 py-3 hover:bg-gray-50 group">
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-semibold text-gray-900">{box.codigo}</span>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_BADGE[box.estado]}`}>
                    {box.estado}
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 truncate">{box.direccionReferencia}</p>
                <CapacityBar box={box} />
              </div>
              {isAdmin && (
                <div className="flex gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {onViewPorts && (
                    <button
                      onClick={() => onViewPorts(box)}
                      className="p-1 text-gray-400 hover:text-blue-600 rounded"
                      title="Ver puertos"
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => onEdit(box)}
                    className="p-1 text-gray-400 hover:text-blue-600 rounded"
                    title="Editar caja"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDelete(box)}
                    className="p-1 text-gray-400 hover:text-red-600 rounded"
                    title="Eliminar caja"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
