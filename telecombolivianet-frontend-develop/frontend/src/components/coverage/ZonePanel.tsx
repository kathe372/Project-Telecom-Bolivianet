import { Plus } from 'lucide-react';
import type { CoverageZone, CoverageZoneStatus } from '@/types/coverage';

const STATUS_BADGE: Record<CoverageZoneStatus, string> = {
  Activa:      'bg-green-100 text-green-800',
  EnExpansion: 'bg-amber-100 text-amber-800',
  Planificada: 'bg-slate-100 text-slate-700',
  Inactiva:    'bg-gray-100 text-gray-500',
};

interface Props {
  zones:          CoverageZone[];
  selectedZoneId: string | null;
  onSelectZone:   (zoneId: string) => void;
  onNewZone:      () => void;
  isAdmin?:       boolean;
}

export default function ZonePanel({ zones, selectedZoneId, onSelectZone, onNewZone, isAdmin = true }: Props) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-900">Zonas de cobertura</h2>
        {isAdmin && (
          <button
            onClick={onNewZone}
            className="flex items-center gap-1 text-xs bg-blue-600 text-white px-2 py-1 rounded-md hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-3 h-3" /> Nueva
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {zones.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-8 px-4">
            No hay zonas. Crea la primera dibujando un polígono en el mapa.
          </p>
        )}
        {zones.map(zone => (
          <button
            key={zone.id}
            onClick={() => onSelectZone(zone.id)}
            className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
              zone.id === selectedZoneId ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-gray-900 truncate pr-2">{zone.nombre}</span>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${STATUS_BADGE[zone.estado]}`}>
                {zone.estado}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-gray-500">
              <span>{zone.tecnologia}</span>
              <span>·</span>
              <span>{zone.velocidadMaxMbps} Mbps</span>
              <span>·</span>
              <span>{zone.boxCount ?? 0} caja(s)</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
