import { useState, useRef, useEffect } from 'react';
import { Loader2, AlertCircle, Plus, Zap } from 'lucide-react';
import {
  createExtraordinaryInvoice,
  MOTIVOS_EXTRAORDINARIOS, MOTIVO_LABELS,
  type ExtraordinaryReason,
} from '@/services/invoiceService';
import { extractApiError } from '@/utils/apiError';

interface Props {
  onClose:   () => void;
  onSuccess: () => void;
}

export function ExtraordinaryInvoiceModal({ onClose, onSuccess }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => { dialogRef.current?.focus(); }, []);
  const [clientSearch, setClientSearch] = useState('');
  const [clientId,     setClientId]     = useState('');
  const [amount,       setAmount]       = useState('');
  const [motivo,       setMotivo]       = useState<ExtraordinaryReason>('Reconexion');
  const [dueDate,      setDueDate]      = useState('');
  const [notes,        setNotes]        = useState('');
  const [saving,       setSaving]       = useState(false);
  const [err,          setErr]          = useState('');

  const canSave = clientId && parseFloat(amount) > 0 && dueDate;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true); setErr('');
    try {
      await createExtraordinaryInvoice({
        ClientId: clientId,
        Amount:   parseFloat(amount),
        Motivo:   motivo,
        DueDate:  dueDate,
        Notes:    notes || undefined,
      });
      onSuccess();
    } catch (e: unknown) {
      setErr(extractApiError(e, 'Error al crear la factura.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="extraordinary-invoice-modal-title" tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }} className="bg-white rounded-2xl shadow-2xl w-full max-w-md outline-none">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 id="extraordinary-invoice-modal-title" className="font-semibold text-gray-900 flex items-center gap-2">
            <Plus className="w-4 h-4 text-indigo-600" /> Nueva factura extraordinaria
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {err && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" /> {err}
            </div>
          )}
          <div>
            <label className="label text-xs">Código TBN o ID del cliente *</label>
            <input
              className="input-field"
              placeholder="TBN-001 o UUID del cliente"
              value={clientSearch}
              onChange={e => { setClientSearch(e.target.value); setClientId(e.target.value.trim()); }}
            />
            <p className="text-xs text-gray-400 mt-0.5">Ingresa el UUID o TBN del cliente</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-xs">Monto (Bs.) *</label>
              <input type="number" min="0.01" step="0.01" className="input-field"
                value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div>
              <label className="label text-xs">Fecha de vencimiento *</label>
              <input type="date" className="input-field"
                value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label text-xs">Motivo *</label>
            <select className="input-field" value={motivo}
              onChange={e => setMotivo(e.target.value as ExtraordinaryReason)}>
              {MOTIVOS_EXTRAORDINARIOS.map(m => (
                <option key={m} value={m}>{MOTIVO_LABELS[m]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label text-xs">Notas (opcional)</label>
            <textarea className="input-field resize-none" rows={2}
              value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Ej: Cambio de router, visita por corte de fibra..." />
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button onClick={handleSave} disabled={!canSave || saving}
              className="btn-primary flex-1">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {saving ? 'Creando...' : 'Crear factura'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
