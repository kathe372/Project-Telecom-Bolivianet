import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2, ChevronDown, ChevronUp, Image, Loader2, Upload, X, XCircle, ZoomIn,
} from 'lucide-react';
import { paymentService } from '@/services/paymentService';
import type { PaymentSummaryDto } from '@/types/client.types';
import { formatBs } from '@/utils/currency';
import { methodIcon, methodLabel } from './profileHelpers';

function ReceiptImageViewer({ url, expanded, onToggle }: {
  url: string; expanded: boolean; onToggle: () => void;
}) {
  const [lightbox, setLightbox] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  const isPdf = url.toLowerCase().endsWith('.pdf');

  return (
    <>
      <div className="mt-2">
        <button onClick={onToggle}
          className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
          <Image className="w-3 h-3" />
          {expanded ? 'Ocultar comprobante' : 'Ver comprobante'}
        </button>
        {expanded && (
          <div className="mt-2">
            {isPdf ? (
              <a href={url} target="_blank" rel="noreferrer"
                className="text-xs text-blue-600 underline">Abrir PDF</a>
            ) : (
              <div className="relative group inline-block cursor-zoom-in"
                onClick={() => setLightbox(true)}>
                <img src={url} alt="Comprobante"
                  className="rounded border border-gray-200 max-h-48 object-contain block" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/25 rounded transition-colors">
                  <ZoomIn className="w-7 h-7 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {lightbox && (
        <div ref={overlayRef}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-4"
          onClick={e => { if (e.target === overlayRef.current) setLightbox(false); }}>
          <button onClick={() => setLightbox(false)}
            className="absolute top-4 right-4 text-white/80 hover:text-white bg-black/30 hover:bg-black/60 rounded-full p-2 transition-colors">
            <X className="w-5 h-5" />
          </button>
          <img src={url} alt="Comprobante"
            className="max-w-[90vw] max-h-[90vh] rounded-xl shadow-2xl object-contain select-none" />
        </div>
      )}
    </>
  );
}

function ReceiptUploadInline({ paymentId }: { paymentId: string }) {
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setErr('Máximo 5 MB'); return; }
    setUploading(true); setErr('');
    try {
      await paymentService.uploadReceiptImage(paymentId, file);
      setDone(true);
    } catch {
      setErr('Error al subir. Intenta de nuevo.');
    } finally { setUploading(false); }
  };

  if (done) return <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Comprobante subido</p>;

  return (
    <label className="mt-1 flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 cursor-pointer">
      {uploading
        ? <><Loader2 className="w-3 h-3 animate-spin" /> Subiendo...</>
        : <><Upload className="w-3 h-3" /> Adjuntar comprobante</>}
      <input type="file" className="hidden" accept="image/jpeg,image/png,application/pdf"
        onChange={handleFile} disabled={uploading} />
      {err && <span className="text-red-500 ml-1">{err}</span>}
    </label>
  );
}

export function PaymentHistory({
  payments, onVoidPayment, isAdmin,
}: {
  payments: PaymentSummaryDto[];
  onVoidPayment: (id: string) => void;
  isAdmin: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [expandedReceipt, setExpandedReceipt] = useState<string | null>(null);

  if (payments.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-4">
        No hay pagos registrados para este cliente.
      </p>
    );
  }

  const visible = expanded ? payments : payments.slice(0, 4);

  return (
    <div>
      <div className="space-y-2">
        {visible.map(p => (
          <div key={p.Id}
            className={`rounded-lg border p-3 text-sm ${p.IsVoided ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-white border-gray-100'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {methodIcon(p.Method)}
                <span className="font-semibold text-gray-900">
                  {formatBs(p.Amount)}
                </span>
                <span className="text-xs text-gray-500">{methodLabel(p.Method)}</span>
                {p.Bank && <span className="text-xs text-gray-400">· {p.Bank}</span>}
                {p.FromWhatsApp && (
                  <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                    WhatsApp
                  </span>
                )}
                {p.IsVoided && (
                  <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                    Anulado
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-400 text-right shrink-0">
                <p>{new Date(p.PaidAt).toLocaleDateString('es-BO')}</p>
                <p>por {p.RegisteredByName}</p>
              </div>
            </div>

            {p.CoveredMonths.length > 0 && (
              <p className="text-xs text-gray-400 mt-1">
                Cubre: {p.CoveredMonths.join(' · ')}
              </p>
            )}

            {p.ReceiptImageUrl && (
              <ReceiptImageViewer url={p.ReceiptImageUrl}
                expanded={expandedReceipt === p.Id}
                onToggle={() => setExpandedReceipt(expandedReceipt === p.Id ? null : p.Id)} />
            )}

            {!p.ReceiptImageUrl && !p.IsVoided && (
              <ReceiptUploadInline paymentId={p.Id} />
            )}

            {isAdmin && p.CanVoid && !p.IsVoided && (
              <button
                onClick={() => onVoidPayment(p.Id)}
                className="mt-2 text-xs text-red-500 hover:text-red-700 hover:underline flex items-center gap-1">
                <XCircle className="w-3 h-3" /> Anular este pago
              </button>
            )}
          </div>
        ))}
      </div>

      {payments.length > 4 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 w-full text-xs text-gray-500 hover:text-gray-700 flex items-center justify-center gap-1 py-1">
          {expanded
            ? <><ChevronUp className="w-3 h-3" /> Ver menos</>
            : <><ChevronDown className="w-3 h-3" /> Ver {payments.length - 4} pagos más</>}
        </button>
      )}
    </div>
  );
}
