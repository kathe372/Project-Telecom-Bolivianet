import { useState, useEffect } from 'react';
import { Settings, XCircle, Activity } from 'lucide-react';
import type { DashboardPreferences } from '@/services/dashboardService';

// El detalle transaccional (métodos de pago, WhatsApp mensaje-a-mensaje,
// zonas) vive en su página dedicada — Cobranza, Conversaciones, Cobertura —
// y no se repite aquí. Aging, carga de técnicos, notificaciones y acciones
// automáticas se muestran siempre (no son opcionales).
const PREF_LABELS: { key: keyof DashboardPreferences; label: string; desc: string }[] = [
  { key: 'ShowKpis',         label: 'KPIs principales',    desc: 'Cobros, clientes activos, deuda total' },
  { key: 'ShowTendencia',    label: 'Tendencia de cobros',  desc: 'Gráfico de barras de los últimos meses' },
  { key: 'ShowTickets',      label: 'Panel de tickets',     desc: 'Por estado, por tipo, resolución promedio y activos urgentes' },
  { key: 'ShowDeudores',     label: 'Deudores',             desc: 'Clientes con deuda pendiente' },
  { key: 'ShowComprobantes', label: 'Cola de comprobantes', desc: 'Últimos comprobantes recibidos por bot' },
];

export default function DashboardCustomizeModal({ open, onClose, prefs, onSave }: {
  open: boolean; onClose: () => void;
  prefs: DashboardPreferences; onSave: (p: DashboardPreferences) => void | Promise<void>;
}) {
  const [local, setLocal]   = useState<DashboardPreferences>(prefs);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setLocal(prefs); }, [open, prefs]);

  if (!open) return null;

  const toggle = (key: keyof DashboardPreferences) =>
    setLocal(prev => ({ ...prev, [key]: !prev[key] }));

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(local); onClose(); }
    finally { setSaving(false); }
  };

  const visibleValues = PREF_LABELS.map(p => local[p.key]);
  const allOn  = visibleValues.every(Boolean);
  const allOff = visibleValues.every(v => !v);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-gray-900">Personalizar dashboard</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700">
            <XCircle className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-1 max-h-[60vh] overflow-y-auto">
          <div className="flex gap-3 mb-3">
            <button
              onClick={() => setLocal(prev => ({ ...prev, ...Object.fromEntries(PREF_LABELS.map(p => [p.key, true])) }))}
              disabled={allOn}
              className="text-xs text-blue-600 hover:underline disabled:opacity-40 disabled:no-underline"
            >
              Activar todo
            </button>
            <span className="text-gray-300">|</span>
            <button
              onClick={() => setLocal(prev => ({ ...prev, ...Object.fromEntries(PREF_LABELS.map(p => [p.key, false])) }))}
              disabled={allOff}
              className="text-xs text-gray-500 hover:underline disabled:opacity-40 disabled:no-underline"
            >
              Desactivar todo
            </button>
          </div>

          {PREF_LABELS.map(({ key, label, desc }) => (
            <label
              key={key}
              className="flex items-start gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                checked={local[key]}
                onChange={() => toggle(key)}
                className="mt-0.5 w-4 h-4 rounded accent-blue-600 cursor-pointer"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
              </div>
            </label>
          ))}
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t bg-gray-50">
          <p className="text-xs text-gray-400">
            {visibleValues.filter(Boolean).length} de {PREF_LABELS.length} secciones visibles
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Activity className="w-3 h-3 animate-spin" />}
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
