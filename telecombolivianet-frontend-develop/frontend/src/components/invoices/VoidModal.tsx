import { useState } from 'react';
import { Loader2, XCircle } from 'lucide-react';
import type { InvoiceDetailDto } from '@/types/invoice.types';

const MONTHS = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

interface Props {
  invoice:   InvoiceDetailDto;
  onConfirm: (justification: string) => void;
  onClose:   () => void;
  saving:    boolean;
}

export function VoidModal({ invoice, onConfirm, onClose, saving }: Props) {
  const [justification, setJustification] = useState('');
  const ok = justification.trim().length >= 10;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="void-modal-title" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }} className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 id="void-modal-title" className="font-semibold text-gray-900">Anular factura</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            <strong>Atención:</strong> Esta acción es irreversible.<br />
            Cliente: <strong>{invoice.ClientName}</strong> ({invoice.TbnCode})<br />
            Período: <strong>{MONTHS[invoice.Month]} {invoice.Year}</strong> —
            Bs. <strong>{invoice.Amount}</strong>
          </div>
          <div>
            <label className="label">Justificación obligatoria (mínimo 10 caracteres)</label>
            <textarea
              rows={3}
              className={`input-field resize-none ${!ok && justification.length > 0 ? 'input-error' : ''}`}
              placeholder="Ej: Error de registro, cliente pagó por otra vía..."
              value={justification}
              onChange={e => setJustification(e.target.value)}
            />
            <p className={`text-xs mt-1 ${ok ? 'text-green-600' : 'text-gray-400'}`}>
              {justification.trim().length}/10 caracteres mínimos
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button
              disabled={!ok || saving}
              onClick={() => onConfirm(justification)}
              className="btn-danger flex-1"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
              {saving ? 'Anulando...' : 'Confirmar anulación'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
