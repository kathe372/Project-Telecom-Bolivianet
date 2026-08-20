import { ChevronDown, ChevronUp, Loader2, Save } from 'lucide-react';
import {
  NOTIF_TYPE_LABELS, HSM_STATUS_COLORS, CATEGORIA_LABELS,
  type NotifConfigDto, type NotifTemplateDto, type NotifType,
} from '@/services/notificationService';

const DELAY_OPTIONS = [
  { value: 0,     label: 'Inmediato (0s)' },
  { value: 3600,  label: '1 hora' },
  { value: 10800, label: '3 horas' },
  { value: 21600, label: '6 horas' },
  { value: 86400, label: '24 horas' },
];

export function TriggersTab({
  configs, plantillas, expandedTrigger, onToggleExpand,
  confirmSuspension, onConfirmSuspensionChange,
  saving, onSave, onUpdateConfig,
}: {
  configs: NotifConfigDto[];
  plantillas: NotifTemplateDto[];
  expandedTrigger: NotifType | null;
  onToggleExpand: (tipo: NotifType | null) => void;
  confirmSuspension: boolean;
  onConfirmSuspensionChange: (v: boolean) => void;
  saving: boolean;
  onSave: () => void;
  onUpdateConfig: (tipo: NotifType, field: keyof NotifConfigDto, value: unknown) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        Activa o desactiva cada trigger y configura su ventana horaria y plantilla asociada.
      </p>

      {configs.map(cfg => {
        const expanded = expandedTrigger === cfg.Tipo;
        const plantilla = plantillas.find(p => p.Tipo === cfg.Tipo);
        return (
          <div key={cfg.Tipo} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50"
              onClick={() => onToggleExpand(expanded ? null : cfg.Tipo)}
            >
              <button
                onClick={e => { e.stopPropagation(); onUpdateConfig(cfg.Tipo, 'Activo', !cfg.Activo); }}
                className={`shrink-0 w-10 h-5 rounded-full transition-colors ${cfg.Activo ? 'bg-green-500' : 'bg-gray-300'}`}
              >
                <span className={`block w-4 h-4 bg-white rounded-full shadow mx-0.5 transition-transform ${cfg.Activo ? 'translate-x-5' : ''}`} />
              </button>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-gray-900">{NOTIF_TYPE_LABELS[cfg.Tipo]}</p>
                {plantilla && (
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded border ${HSM_STATUS_COLORS[plantilla.HsmStatus]}`}>
                      HSM: {plantilla.HsmStatus}
                    </span>
                    <span className="text-xs text-gray-400">{CATEGORIA_LABELS[plantilla.Categoria]}</span>
                  </div>
                )}
              </div>
              {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </div>

            {expanded && (
              <div className="px-4 pb-4 pt-1 border-t border-gray-100 grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Delay</label>
                  <select
                    value={cfg.DelaySegundos}
                    onChange={e => onUpdateConfig(cfg.Tipo, 'DelaySegundos', +e.target.value)}
                    className="w-full border rounded px-2 py-1.5 text-sm"
                  >
                    {DELAY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Ventana horaria</label>
                  <div className="flex items-center gap-2">
                    <input type="time" value={cfg.HoraInicio}
                      onChange={e => onUpdateConfig(cfg.Tipo, 'HoraInicio', e.target.value)}
                      className="border rounded px-2 py-1.5 text-sm flex-1" />
                    <span className="text-gray-400 text-xs">–</span>
                    <input type="time" value={cfg.HoraFin}
                      onChange={e => onUpdateConfig(cfg.Tipo, 'HoraFin', e.target.value)}
                      className="border rounded px-2 py-1.5 text-sm flex-1" />
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-600 block mb-1">Plantilla asociada (US-NOT-04)</label>
                  <select
                    value={cfg.PlantillaId ?? ''}
                    onChange={e => onUpdateConfig(cfg.Tipo, 'PlantillaId', e.target.value || null)}
                    className="w-full border rounded px-2 py-1.5 text-sm"
                  >
                    <option value="">— Usar plantilla del mismo tipo —</option>
                    {plantillas.filter(p => p.HsmStatus !== 'Rechazada').map(p => (
                      <option key={p.Id} value={p.Id}>{NOTIF_TYPE_LABELS[p.Tipo]} — {p.Texto.slice(0, 50)}…</option>
                    ))}
                  </select>
                </div>
                {cfg.Tipo === 'SUSPENSION' && !cfg.Activo && (
                  <div className="col-span-2">
                    <label className="flex items-center gap-2 text-sm text-red-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={confirmSuspension}
                        onChange={e => onConfirmSuspensionChange(e.target.checked)}
                        className="accent-red-600"
                      />
                      Confirmo que quiero desactivar el trigger crítico de Suspensión
                    </label>
                  </div>
                )}
                {cfg.DiasAntes !== null && (
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Días antes del vencimiento</label>
                    <input type="number" min={1} value={cfg.DiasAntes ?? 1}
                      onChange={e => onUpdateConfig(cfg.Tipo, 'DiasAntes', +e.target.value)}
                      className="w-full border rounded px-2 py-1.5 text-sm" />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div className="flex justify-end">
        <button
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar triggers
        </button>
      </div>
    </div>
  );
}
