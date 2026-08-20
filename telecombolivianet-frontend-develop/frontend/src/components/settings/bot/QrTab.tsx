import type { RefObject } from 'react';
import { AlertCircle, CheckCircle2, Image as ImageIcon, Loader2, Upload } from 'lucide-react';

export type CompanyQrInfo = {
  HasQr: boolean;
  Path: string | null;
  UpdatedAt: string | null;
  ExpiresAt: string | null;
  DaysRemaining: number | null;
};

export function QrTab({
  qrInfo, loading, uploading, blobUrl, expiresAt,
  onExpiresAtChange, onFileChange, onMissingExpiry, inputRef,
}: {
  qrInfo: CompanyQrInfo | null;
  loading: boolean;
  uploading: boolean;
  blobUrl: string | null;
  expiresAt: string;
  onExpiresAtChange: (v: string) => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onMissingExpiry: () => void;
  inputRef: RefObject<HTMLInputElement>;
}) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600">
        QR de pago global de la empresa. Se envía a todos los clientes cuando solicitan el código QR de pago por WhatsApp.
      </p>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
        </div>
      ) : (
        <div className="space-y-4">
          {qrInfo?.DaysRemaining !== null && qrInfo?.DaysRemaining !== undefined && qrInfo.DaysRemaining <= 7 && (
            <div className={`flex items-start gap-2 p-3 rounded-lg text-sm border ${
              qrInfo.DaysRemaining <= 0
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-amber-50 border-amber-200 text-amber-700'
            }`}>
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                {qrInfo.DaysRemaining <= 0
                  ? `El QR de pago venció hace ${Math.abs(qrInfo.DaysRemaining)} día(s). Los clientes no pueden pagar con QR. Actualízalo de inmediato.`
                  : `El QR de pago vence en ${qrInfo.DaysRemaining} día(s) (${qrInfo.ExpiresAt}). Actualízalo antes de que expire.`}
              </span>
            </div>
          )}

          {qrInfo?.HasQr ? (
            <div className={`flex gap-6 items-start p-4 border rounded-lg ${
              (qrInfo.DaysRemaining ?? 999) <= 0 ? 'border-red-200 bg-red-50'
              : (qrInfo.DaysRemaining ?? 999) <= 7 ? 'border-amber-200 bg-amber-50'
              : 'border-green-200 bg-green-50'
            }`}>
              {blobUrl ? (
                <img
                  src={blobUrl}
                  alt="QR de pago"
                  className="w-40 h-40 object-contain border border-gray-200 rounded-lg bg-white p-1 shrink-0"
                />
              ) : (
                <div className="w-40 h-40 flex items-center justify-center border border-gray-200 rounded-lg bg-white shrink-0">
                  <ImageIcon className="w-8 h-8 text-gray-300" />
                </div>
              )}
              <div className="space-y-1">
                <p className="text-sm font-medium text-green-800 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> QR configurado
                </p>
                {qrInfo.UpdatedAt && (
                  <p className="text-xs text-gray-500">
                    Actualizado: {new Date(qrInfo.UpdatedAt).toLocaleString('es-BO')}
                  </p>
                )}
                {qrInfo.ExpiresAt && (
                  <p className={`text-xs font-medium ${
                    (qrInfo.DaysRemaining ?? 999) <= 0 ? 'text-red-600'
                    : (qrInfo.DaysRemaining ?? 999) <= 7 ? 'text-amber-600'
                    : 'text-gray-600'
                  }`}>
                    Vence: {qrInfo.ExpiresAt}
                    {qrInfo.DaysRemaining !== null && (
                      <span className="ml-1">
                        ({qrInfo.DaysRemaining <= 0
                          ? `venció hace ${Math.abs(qrInfo.DaysRemaining)} día(s)`
                          : `${qrInfo.DaysRemaining} día(s) restantes`})
                      </span>
                    )}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-gray-200 rounded-lg text-gray-400 gap-2">
              <ImageIcon className="w-10 h-10" />
              <p className="text-sm">No hay QR configurado todavía.</p>
            </div>
          )}

          <div className="p-4 border border-gray-200 rounded-lg bg-gray-50 space-y-3">
            <p className="text-sm font-medium text-gray-700">
              {qrInfo?.HasQr ? 'Reemplazar QR' : 'Subir QR de pago'}
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Fecha de vencimiento del QR <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={expiresAt}
                min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
                onChange={e => onExpiresAtChange(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                disabled={uploading}
              />
              <p className="text-xs text-gray-400 mt-0.5">Fecha en que el QR de tu banco/billetera digital expira</p>
            </div>
            <div className="flex items-center gap-3">
              <label
                className={`cursor-pointer inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg text-white transition-colors ${
                  uploading ? 'bg-green-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
                }`}
                onClick={e => {
                  if (!expiresAt) {
                    e.preventDefault();
                    onMissingExpiry();
                  }
                }}
              >
                {uploading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Upload className="w-4 h-4" />}
                Seleccionar imagen QR
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={uploading}
                  onChange={onFileChange}
                />
              </label>
              <span className="text-xs text-gray-400">JPG, PNG, WebP — máx. 5 MB</span>
            </div>
            {!expiresAt && (
              <p className="text-xs text-amber-600">⚠ Ingresa primero la fecha de vencimiento.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
