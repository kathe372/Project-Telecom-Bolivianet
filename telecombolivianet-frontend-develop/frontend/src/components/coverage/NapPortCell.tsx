import type { NapPort, NapPortStatus } from '@/types/coverage';

export const PORT_LABEL: Record<NapPortStatus, string> = {
  Free: 'Libre', Used: 'Ocupado', Reserved: 'Reservado', Damaged: 'Dañado',
};

/** Paleta alineada con la CapacityBar de la caja: ocupado=azul, reservado=ámbar. */
export const PORT_BADGE: Record<NapPortStatus, string> = {
  Free:     'bg-emerald-100 text-emerald-800',
  Used:     'bg-blue-100 text-blue-800',
  Reserved: 'bg-amber-100 text-amber-800',
  Damaged:  'bg-red-100 text-red-800',
};

interface Props {
  port:     NapPort;
  selected: boolean;
  onSelect: (numero: number) => void;
}

/** PR-4b: una celda de puerto en la grilla patch-panel (presentacional puro). */
export default function NapPortCell({ port, selected, onSelect }: Props) {
  return (
    <button
      type="button"
      onClick={() => onSelect(port.numero)}
      title={`Puerto ${port.numero} · ${PORT_LABEL[port.status]}`}
      className={`flex flex-col items-center justify-center gap-0.5 aspect-square rounded-lg
        text-sm font-bold border-2 transition-colors ${PORT_BADGE[port.status]}
        ${selected ? 'border-blue-600 ring-2 ring-blue-500/25' : 'border-transparent'}`}
    >
      {port.numero}
      <span className="text-[8px] font-semibold uppercase tracking-wide opacity-80">
        {PORT_LABEL[port.status]}
      </span>
    </button>
  );
}
