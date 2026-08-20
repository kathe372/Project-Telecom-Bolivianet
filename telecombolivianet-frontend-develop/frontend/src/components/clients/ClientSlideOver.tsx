import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X, Phone, MapPin, Wifi, CreditCard, AlertTriangle,
  Pencil, PauseCircle, PlayCircle, FileText, Loader2,
  CheckCircle2, WifiOff, User,
} from 'lucide-react';
import { clientService } from '@/services/clientService';
import { useAuthStore } from '@/store/authStore';
import type { ClientDetailDto } from '@/types/client.types';
import { formatBsAmount } from '@/utils/currency';

interface Props {
  clientId: string | null;
  onClose:  () => void;
  onAction: () => void;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  Activo:     { bg: 'bg-green-100',  text: 'text-green-700', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  Suspendido: { bg: 'bg-amber-100',  text: 'text-amber-700', icon: <WifiOff      className="w-3.5 h-3.5" /> },
  DadoDeBaja: { bg: 'bg-gray-100',   text: 'text-gray-500',  icon: <User         className="w-3.5 h-3.5" /> },
};

const fmtBs   = (v: number) => `Bs ${formatBsAmount(v)}`;
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';


export default function ClientSlideOver({ clientId, onClose, onAction }: Props) {
  const navigate  = useNavigate();
  const isAdmin   = useAuthStore(s => s.isAdmin);

  const [data,    setData]    = useState<ClientDetailDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [acting,  setActing]  = useState(false);

  useEffect(() => {
    if (!clientId) { setData(null); return; }
    let cancelled = false;
    setLoading(true); setError('');
    clientService.getById(clientId)
      .then(d  => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError('No se pudo cargar el cliente.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [clientId]);

  useEffect(() => {
    if (!clientId) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [clientId, onClose]);

  const handleToggleStatus = async () => {
    if (!data) return;
    setActing(true);
    try {
      if (data.Status === 'Activo') {
        await clientService.suspend(data.Id);
        setData(d => d ? { ...d, Status: 'Suspendido' } : d);
      } else if (data.Status === 'Suspendido') {
        await clientService.reactivate(data.Id);
        setData(d => d ? { ...d, Status: 'Activo' } : d);
      }
      onAction();
    } catch {
    } finally {
      setActing(false);
    }
  };

  const open = !!clientId;

  return (
    <>
      {}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 transition-opacity"
          onClick={onClose}
        />
      )}

      {}
      <div className={`fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out ${
        open ? 'translate-x-0' : 'translate-x-full'
      }`}>
        {}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-900">Detalle del cliente</p>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <AlertTriangle className="w-8 h-8 text-red-400" />
              <p className="text-sm text-gray-500">{error}</p>
            </div>
          )}

          {data && !loading && (
            <div className="px-5 py-4 space-y-5">
              {}
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-700 font-bold text-base flex items-center justify-center shrink-0">
                  {data.FullName.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold text-gray-900 truncate">{data.FullName}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{data.TbnCode} · CI {data.IdentityCard}</p>
                  <StatusBadge status={data.Status} />
                </div>
              </div>

              <hr className="border-gray-100" />

              {}
              <div className="space-y-3">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Servicio</p>
                <InfoRow icon={<Wifi className="w-4 h-4 text-blue-400" />} label="Plan">
                  {data.Plan.Name}
                  <span className="text-gray-400 ml-1">· {data.Plan.SpeedMb} Mbps</span>
                  <span className="ml-1 font-semibold text-gray-900">{fmtBs(data.Plan.MonthlyPrice)}/mes</span>
                </InfoRow>
                <InfoRow icon={<MapPin className="w-4 h-4 text-indigo-400" />} label="Zona">
                  {data.Zone}{data.Street ? ` — ${data.Street}` : ''}
                  {data.LocationRef && <span className="text-gray-400 block text-xs mt-0.5">{data.LocationRef}</span>}
                </InfoRow>
                <InfoRow icon={<Phone className="w-4 h-4 text-green-400" />} label="Teléfono">
                  {data.PhoneMain}
                  {data.PhoneSecondary && <span className="text-gray-400 ml-2">{data.PhoneSecondary}</span>}
                </InfoRow>
                <InfoRow icon={<Wifi className="w-4 h-4 text-gray-400" />} label="Winbox / ONU">
                  <span className="font-mono text-xs">{data.WinboxNumber}</span>
                  {data.OnuSerialNumber && <span className="text-gray-400 ml-2 font-mono text-xs">{data.OnuSerialNumber}</span>}
                </InfoRow>
              </div>

              <hr className="border-gray-100" />

              {}
              <div className="space-y-3">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Finanzas</p>

                <div className="grid grid-cols-2 gap-2">
                  <StatBox
                    label="Deuda total"
                    value={fmtBs(data.TotalDebt)}
                    accent={data.TotalDebt > 0 ? 'text-red-600' : 'text-green-600'}
                  />
                  <StatBox
                    label="Meses pendientes"
                    value={`${data.PendingMonths}`}
                    accent={data.PendingMonths > 0 ? 'text-amber-600' : 'text-green-600'}
                  />
                  {data.CreditBalance > 0 && (
                    <StatBox label="Saldo a favor" value={fmtBs(data.CreditBalance)} accent="text-blue-600" />
                  )}
                  <StatBox label="Último pago" value={fmtDate(data.LastPaymentDate)} />
                </div>
              </div>

              <hr className="border-gray-100" />

              {}
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Instalación</p>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Fecha</span>
                  <span className="text-gray-800">{fmtDate(data.InstallationDate)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Instalador</span>
                  <span className="text-gray-800 truncate max-w-[160px]">{data.InstalledByName}</span>
                </div>
                {data.HasTvCable && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-medium">
                    TV Cable incluido
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {}
        {data && !loading && (
          <div className="px-5 py-4 border-t border-gray-100 space-y-2">
            <button
              onClick={() => { navigate(`/clients/${data.Id}/edit`); onClose(); }}
              className="btn-primary w-full py-2.5"
            >
              <Pencil className="w-4 h-4" /> Editar cliente
            </button>
            <button
              onClick={() => { navigate(`/invoices?clientId=${data.Id}`); onClose(); }}
              className="btn-secondary w-full py-2.5"
            >
              <FileText className="w-4 h-4" /> Ver cobranza
            </button>
            <button
              onClick={() => { navigate(`/payments?clientId=${data.Id}`); onClose(); }}
              className="btn-secondary w-full py-2.5"
            >
              <CreditCard className="w-4 h-4" /> Historial pagos
            </button>
            {isAdmin() && data.Status !== 'DadoDeBaja' && (
              <button
                onClick={handleToggleStatus}
                disabled={acting}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                  data.Status === 'Activo'
                    ? 'border border-amber-300 text-amber-700 hover:bg-amber-50'
                    : 'border border-green-300 text-green-700 hover:bg-green-50'
                }`}
              >
                {acting
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : data.Status === 'Activo'
                  ? <><PauseCircle className="w-4 h-4" /> Suspender</>
                  : <><PlayCircle className="w-4 h-4" /> Reactivar</>
                }
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}


function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status];
  if (!s) return null;
  return (
    <span className={`inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      {s.icon} {status}
    </span>
  );
}

function InfoRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="shrink-0 mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-gray-400 leading-none mb-0.5">{label}</p>
        <div className="text-sm text-gray-700">{children}</div>
      </div>
    </div>
  );
}

function StatBox({ label, value, accent = 'text-gray-800' }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-2.5">
      <p className="text-[10px] text-gray-400 mb-0.5">{label}</p>
      <p className={`text-sm font-bold ${accent}`}>{value}</p>
    </div>
  );
}
