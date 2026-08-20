import { useState, useEffect } from 'react';
import { Loader2, X, XCircle, FileSpreadsheet } from 'lucide-react';
import { paymentService } from '@/services/paymentService';
import type { PaymentDetailDto } from '@/types/payment.types';
import { extractApiError } from '@/utils/apiError';

interface Props {
  paymentId: string;
  onVoided:  () => void;
  onClose:   () => void;
}

export function PaymentDetailModal({ paymentId, onVoided, onClose }: Props) {
  const [detail,        setDetail]        = useState<PaymentDetailDto | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [showVoidForm,  setShowVoidForm]  = useState(false);
  const [justification, setJustification] = useState('');
  const [voiding,       setVoiding]       = useState(false);
  const [voidError,     setVoidError]     = useState('');
  const [loadError,     setLoadError]     = useState('');

  useEffect(() => {
    paymentService.getById(paymentId)
      .then(setDetail)
      .catch(() => setLoadError('No se pudo cargar el detalle del pago.'))
      .finally(() => setLoading(false));
  }, [paymentId]);

  const handleVoid = async () => {
    if (justification.trim().length < 10) return;
    setVoiding(true); setVoidError('');
    try {
      await paymentService.voidPayment(paymentId, justification);
      onVoided();
    } catch (e: unknown) {
      setVoidError(extractApiError(e, 'Error al anular el pago.'));
    } finally {
      setVoiding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="payment-detail-modal-title" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h3 id="payment-detail-modal-title" className="font-semibold text-gray-900">Detalle del pago</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : loadError ? (
          <div className="px-6 py-8 text-center text-sm text-red-600">{loadError}</div>
        ) : detail ? (
          <div className="px-6 py-5 space-y-4 text-sm">
            {[
              ['Cliente',     `${detail.ClientName} (${detail.TbnCode})`],
              ['Teléfono',    detail.ClientPhone],
              ['Monto',       `Bs. ${detail.Amount}`],
              ['Método',      detail.Method],
              ['Banco',         detail.Bank ?? '—'],
              ['Ref. bancaria', detail.BankReference ?? '—'],
              ['Fecha pago',    new Date(detail.PaidAt).toLocaleDateString('es-BO')],
              ['Registrado',    new Date(detail.RegisteredAt).toLocaleDateString('es-BO')],
              ['Por',           detail.RegisteredByName],
              ['Origen',        detail.FromWhatsApp ? 'WhatsApp 📱' : 'Manual 🖥️'],
              ['Recibo N.º',    detail.PhysicalReceiptNumber ?? '—'],
              ['Meses cubiertos', detail.CoveredMonths.join(', ') || '—'],
            ].map(([l, v]) => (
              <div key={l} className="flex justify-between border-b border-gray-50 pb-2 last:border-0">
                <span className="text-gray-500 shrink-0 mr-4">{l}</span>
                <span className="font-medium text-gray-900 text-right">{v}</span>
              </div>
            ))}

            {detail.ReceiptImageUrl && (
              <div>
                <p className="text-gray-500 mb-2">Comprobante</p>
                {detail.ReceiptImageUrl.endsWith('.pdf') ? (
                  <a href={detail.ReceiptImageUrl} target="_blank" rel="noreferrer"
                    className="btn-secondary text-sm inline-flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4" /> Abrir PDF
                  </a>
                ) : (
                  <img src={detail.ReceiptImageUrl} alt="Comprobante"
                    className="rounded-lg border border-gray-200 max-h-64 object-contain w-full" />
                )}
              </div>
            )}

            {detail.CanVoid && !detail.IsVoided && (
              <div className="pt-2">
                {!showVoidForm ? (
                  <button onClick={() => setShowVoidForm(true)} className="btn-danger text-sm w-full">
                    <XCircle className="w-4 h-4" /> Anular este pago
                  </button>
                ) : (
                  <div className="space-y-3 bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-sm font-medium text-red-800">
                      Anular pago — las facturas volverán a pendiente/vencida
                    </p>
                    {voidError && <p className="text-xs text-red-700">{voidError}</p>}
                    <textarea rows={3}
                      className={`input-field resize-none text-sm ${justification.trim().length < 10 && justification.length > 0 ? 'input-error' : ''}`}
                      placeholder="Justificación obligatoria (mínimo 10 caracteres)..."
                      value={justification}
                      onChange={e => setJustification(e.target.value)} />
                    <p className="text-xs text-gray-500">{justification.trim().length}/10 mínimo</p>
                    <div className="flex gap-2">
                      <button onClick={handleVoid}
                        disabled={justification.trim().length < 10 || voiding}
                        className="btn-danger flex-1 text-sm">
                        {voiding ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {voiding ? 'Anulando...' : 'Confirmar anulación'}
                      </button>
                      <button onClick={() => setShowVoidForm(false)} className="btn-secondary flex-1 text-sm">
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {detail.IsVoided && (
              <p className="text-xs text-red-600 text-center pt-2">Este pago fue anulado</p>
            )}
          </div>
        ) : (
          <p className="text-center py-8 text-gray-400">No se pudo cargar el pago.</p>
        )}
      </div>
    </div>
  );
}
