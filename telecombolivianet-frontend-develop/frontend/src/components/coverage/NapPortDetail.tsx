import { PORT_LABEL, PORT_BADGE } from './NapPortCell';
import type { NapPort } from '@/types/coverage';

interface Props {
  port:     NapPort;
  onDamage: (numero: number) => void;
  onRepair: (numero: number) => void;
}

/** PR-4b: detalle del puerto seleccionado (cliente/ONU) + acciones (presentacional). */
export default function NapPortDetail({ port, onDamage, onRepair }: Props) {
  const canDamage = port.status === 'Free';
  const canRepair = port.status === 'Damaged';

  return (
    <aside className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col gap-3 self-start">
      <h4 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
        Puerto {port.numero}
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${PORT_BADGE[port.status]}`}>
          {PORT_LABEL[port.status]}
        </span>
      </h4>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        {port.accountId && (
          <><dt className="text-gray-400">Cliente</dt><dd className="text-gray-800 font-mono">{port.accountId}</dd></>
        )}
        {port.onuSerial && (
          <><dt className="text-gray-400">ONU</dt><dd className="text-gray-800 font-mono">{port.onuSerial}</dd></>
        )}
        {port.installationId && (
          <><dt className="text-gray-400">Instalación</dt><dd className="text-gray-800 font-mono">{port.installationId}</dd></>
        )}
      </dl>

      <div className="flex gap-2">
        <button onClick={() => onDamage(port.numero)} disabled={!canDamage}
          className="btn-danger text-xs disabled:opacity-40">Dañar</button>
        <button onClick={() => onRepair(port.numero)} disabled={!canRepair}
          className="btn-secondary text-xs disabled:opacity-40">Reparar</button>
      </div>

      <p className="text-[11px] text-gray-400">
        {canDamage ? 'Dañar reduce la capacidad usable de la caja.'
          : canRepair ? 'Reparar devuelve el puerto al pool.'
          : 'Puerto en uso: libéralo antes de marcarlo dañado.'}
      </p>
    </aside>
  );
}
