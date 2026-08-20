import { Loader2, AlertTriangle, X } from 'lucide-react';

export interface ConfirmState {
  open:         boolean;
  title:        string;
  message:      string;
  confirmLabel: string;
  variant:      'warning' | 'danger';
  onConfirm:    () => Promise<void>;
}

export const CONFIRM_CLOSED: ConfirmState = {
  open: false, title: '', message: '', confirmLabel: 'Confirmar',
  variant: 'warning', onConfirm: async () => {},
};

interface Props {
  state:   ConfirmState;
  onClose: () => void;
  running: boolean;
}

export default function ConfirmDialog({ state, onClose, running }: Props) {
  if (!state.open) return null;
  const isRed = state.variant === 'danger';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }} className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className={`p-2 rounded-full ${isRed ? 'bg-red-100' : 'bg-amber-100'}`}>
            <AlertTriangle className={`w-5 h-5 ${isRed ? 'text-red-600' : 'text-amber-600'}`} />
          </div>
          <div className="flex-1">
            <h3 id="confirm-dialog-title" className="font-semibold text-gray-900 text-base">{state.title}</h3>
            <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">{state.message}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} disabled={running} className="btn-secondary text-sm">
            Cancelar
          </button>
          <button
            onClick={state.onConfirm}
            disabled={running}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50
              ${isRed ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-500 hover:bg-amber-600'}`}
          >
            {running && <Loader2 className="w-3 h-3 animate-spin" />}
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
