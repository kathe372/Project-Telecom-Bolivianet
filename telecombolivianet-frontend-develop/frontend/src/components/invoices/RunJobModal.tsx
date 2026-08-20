import { useState } from 'react';
import { Loader2, Play, Eye, AlertCircle, CheckCircle2 } from 'lucide-react';
import { invoiceService } from '@/services/invoiceService';
import type { BillingPreviewDto } from '@/types/invoice.types';
import { fmtBsDec } from '@/utils/invoiceFormatters';

const MONTHS = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

interface Props {
  onConfirm: (year: number, month: number) => void;
  onClose:   () => void;
  running:   boolean;
}

export function RunJobModal({ onConfirm, onClose, running }: Props) {
  const now = new Date();
  const [year,    setYear]    = useState(now.getFullYear());
  const [month,   setMonth]   = useState(now.getMonth() + 1);
  const [preview, setPreview] = useState<BillingPreviewDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const handlePreview = async () => {
    setLoading(true); setError(''); setPreview(null);
    try {
      const p = await invoiceService.getBillingPreview(year, month);
      setPreview(p);
    } catch {
      setError('No se pudo obtener la vista previa.');
    } finally {
      setLoading(false);
    }
  };

  const handleYearMonthChange = () => {
    setPreview(null);
    setError('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="run-job-modal-title"
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">

        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 id="run-job-modal-title" className="font-semibold text-gray-900">
            Ejecutar facturación
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-600">
            Genera facturas del período seleccionado. Los clientes ya facturados ese mes son
            omitidos. Usa <strong>Vista previa</strong> para revisar antes de ejecutar.
          </p>

          {}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Año</label>
              <input type="number" className="input-field"
                value={year} min={2024} max={2100}
                onChange={e => { setYear(parseInt(e.target.value)); handleYearMonthChange(); }} />
            </div>
            <div>
              <label className="label">Mes</label>
              <select className="input-field"
                value={month} onChange={e => { setMonth(parseInt(e.target.value)); handleYearMonthChange(); }}>
                {MONTHS.slice(1).map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          {}
          {preview && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2 text-sm">
              <p className="font-medium text-gray-800 flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-blue-500" />
                Vista previa: <span className="text-blue-600">{preview.Period}</span>
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-gray-700">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                  Se generarán:
                </span>
                <span className="font-semibold text-green-700">{preview.ToGenerate} facturas</span>

                <span className="text-gray-500">Ya facturados:</span>
                <span>{preview.AlreadyBilled}</span>

                <span className="text-gray-500">Dados de baja:</span>
                <span>{preview.ExcludedBaja}</span>

                {preview.WithErrors > 0 && <>
                  <span className="flex items-center gap-1 text-amber-600">
                    <AlertCircle className="w-3.5 h-3.5" /> Sin plan:
                  </span>
                  <span className="text-amber-600 font-medium">{preview.WithErrors}</span>
                </>}

                <span className="text-gray-500 border-t border-gray-200 pt-1 mt-0.5">
                  Total estimado:
                </span>
                <span className="font-semibold border-t border-gray-200 pt-1 mt-0.5">
                  {fmtBsDec(preview.EstimatedTotal)}
                </span>
              </div>
              {preview.ToGenerate === 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mt-2">
                  No hay clientes por facturar en este período.
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4" /> {error}
            </p>
          )}

          {}
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary flex-1" disabled={running}>
              Cancelar
            </button>
            {!preview ? (
              <button
                onClick={handlePreview}
                disabled={loading}
                className="btn-secondary flex-1 border-blue-200 text-blue-700 hover:bg-blue-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                {loading ? 'Calculando...' : 'Vista previa'}
              </button>
            ) : (
              <button
                disabled={running || preview.ToGenerate === 0}
                onClick={() => onConfirm(year, month)}
                className="btn-primary flex-1"
              >
                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {running ? 'Ejecutando...' : 'Ejecutar'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
