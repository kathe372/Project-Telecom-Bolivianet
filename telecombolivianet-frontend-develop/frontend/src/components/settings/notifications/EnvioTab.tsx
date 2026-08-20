import { Loader2, Send } from 'lucide-react';
import {
  NOTIF_TYPE_LABELS, NOTIF_TYPES_ACTIVOS, HSM_STATUS_COLORS,
  type NotifTemplateDto, type NotifType, type NotifSegmentDto,
} from '@/services/notificationService';

export type BulkSendResult = { Enviados: number; OmitidosAntispam: number; SinTelefono: number };

export function EnvioTab({
  plantillas, segments, envioTipo, onTipoChange, envioSegId, onSegChange,
  onSend, sending, result,
}: {
  plantillas: NotifTemplateDto[];
  segments: NotifSegmentDto[];
  envioTipo: NotifType;
  onTipoChange: (t: NotifType) => void;
  envioSegId: string;
  onSegChange: (id: string) => void;
  onSend: () => void;
  sending: boolean;
  result: BulkSendResult | null;
}) {
  return (
    <div className="max-w-lg space-y-4">
      <p className="text-sm text-gray-600">
        Envía una notificación de forma masiva. El sistema omite clientes que ya recibieron
        el mismo tipo de mensaje en las últimas <strong>24 horas</strong> (anti-spam).
      </p>

      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1">Tipo de notificación</label>
        <select
          value={envioTipo}
          onChange={e => onTipoChange(e.target.value as NotifType)}
          className="w-full border rounded-lg px-3 py-2 text-sm"
        >
          {NOTIF_TYPES_ACTIVOS.map(t => (
            <option key={t} value={t}>{NOTIF_TYPE_LABELS[t]}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1">
          Segmento destinatarios
        </label>
        <select
          value={envioSegId}
          onChange={e => onSegChange(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Todos los clientes activos</option>
          {segments.map(s => (
            <option key={s.Id} value={s.Id}>
              {s.Nombre} {s.ClientesEstimados !== null ? `(~${s.ClientesEstimados})` : ''}
            </option>
          ))}
        </select>
      </div>

      {(() => {
        const p = plantillas.find(p => p.Tipo === envioTipo);
        if (!p) return null;
        return (
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-medium text-gray-600">Plantilla que se enviará:</p>
              <span className={`text-xs px-1.5 py-0.5 rounded border ${HSM_STATUS_COLORS[p.HsmStatus]}`}>
                {p.HsmStatus}
              </span>
            </div>
            {p.HsmStatus === 'Rechazada' && (
              <p className="text-xs text-red-600 mb-1">⚠️ Esta plantilla está rechazada. Actualiza su estado antes de enviar.</p>
            )}
            <p className="text-xs text-gray-700 whitespace-pre-line line-clamp-3">{p.Texto}</p>
          </div>
        );
      })()}

      <button
        onClick={onSend}
        disabled={sending || plantillas.find(p => p.Tipo === envioTipo)?.HsmStatus === 'Rechazada'}
        className="flex items-center gap-2 w-full justify-center bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
      >
        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {sending ? 'Enviando...' : 'Iniciar envío masivo'}
      </button>

      {result && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl space-y-1">
          <p className="text-sm font-semibold text-green-800">Envío completado</p>
          <div className="grid grid-cols-3 gap-2 text-center mt-2">
            <div className="bg-white rounded-lg p-2 border border-green-100">
              <p className="text-2xl font-bold text-green-700">{result.Enviados}</p>
              <p className="text-xs text-gray-500">Enviados</p>
            </div>
            <div className="bg-white rounded-lg p-2 border border-yellow-100">
              <p className="text-2xl font-bold text-yellow-600">{result.OmitidosAntispam}</p>
              <p className="text-xs text-gray-500">Anti-spam</p>
            </div>
            <div className="bg-white rounded-lg p-2 border border-gray-100">
              <p className="text-2xl font-bold text-gray-500">{result.SinTelefono}</p>
              <p className="text-xs text-gray-500">Sin teléfono</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
