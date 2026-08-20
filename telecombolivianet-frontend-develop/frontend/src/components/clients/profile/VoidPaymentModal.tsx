import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { extractApiError } from '@/utils/apiError';

export function VoidPaymentModal({
  onConfirm, onClose,
}: {
  onConfirm: (justif: string) => Promise<void>;
  onClose: () => void;
}) {
  const [justif, setJustif] = useState('');
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');
  const ok = justif.trim().length >= 10;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Anular pago</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            Las facturas cubiertas volverán a estado pendiente/vencida.
            Solo disponible en los 30 días posteriores al registro.
          </p>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div>
            <label className="label">Justificación (mínimo 10 caracteres)</label>
            <textarea rows={3} className="input-field resize-none"
              value={justif} onChange={e => setJustif(e.target.value)}
              placeholder="Ej: Error de registro, el cliente no realizó este pago..." />
            <p className="text-xs text-gray-400 mt-1">{justif.trim().length}/10</p>
          </div>
          <div className="flex gap-3">
            <button
              disabled={!ok || saving}
              onClick={async () => {
                setSaving(true); setErr('');
                try { await onConfirm(justif); onClose(); }
                catch (e: unknown) {
                  setErr(extractApiError(e, 'Error al anular.'));
                }
                finally { setSaving(false); }
              }}
              className="btn-danger flex-1 text-sm">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? 'Anulando...' : 'Confirmar anulación'}
            </button>
            <button onClick={onClose} className="btn-secondary flex-1 text-sm">Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
