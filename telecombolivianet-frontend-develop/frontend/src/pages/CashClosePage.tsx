import { useEffect, useState, useCallback } from 'react';
import {
  Loader2, AlertCircle, CheckCircle2, DollarSign,
  Clock, LogOut, History, Users, Download,
} from 'lucide-react';
import ConfirmDialog, { type ConfirmState, CONFIRM_CLOSED } from '@/components/shared/ConfirmDialog';
import {
  getActiveTurno, cerrarTurno, getCashCloses,
  type CashCloseDto,
} from '@/services/paymentService';
import { useAuthContext } from '@/contexts/AuthContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { formatBsAmount } from '@/utils/currency';


const fmt = (n: number) => formatBsAmount(n, 2);

const METHOD_COLORS: Record<string, string> = {
  Efectivo:         'bg-green-100 text-green-800',
  DepositoBancario: 'bg-blue-100 text-blue-800',
  QR:               'bg-purple-100 text-purple-800',
  Transferencia:    'bg-indigo-100 text-indigo-800',
};


export default function CashClosePage() {
  usePageTitle('Cierre de Caja');
  const { user } = useAuthContext();
  const [loading, setLoading]       = useState(true);
  const [turno, setTurno]           = useState<CashCloseDto | null>(null);
  const [historial, setHistorial]   = useState<CashCloseDto[]>([]);
  const [error, setError]           = useState<string | null>(null);
  const [success, setSuccess]       = useState<string | null>(null);
  const [cerrando, setCerrando]     = useState(false);
  const [tab, setTab]               = useState<'turno' | 'historial'>('turno');
  const [confirmDialog,  setConfirmDialog]  = useState<ConfirmState>(CONFIRM_CLOSED);
  const [confirmRunning, setConfirmRunning] = useState(false);
  const closeConfirm = () => { setConfirmDialog(CONFIRM_CLOSED); setConfirmRunning(false); };

  const isAdmin = user?.roles?.includes('Admin') ?? false;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [turnoData, histData] = await Promise.all([
        getActiveTurno(),
        isAdmin ? getCashCloses() : Promise.resolve([]),
      ]);
      setTurno(turnoData);
      setHistorial(histData);
    } catch {
      setError('Error al cargar los datos de caja.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { load(); }, [load]);

  const handleCerrarTurno = () => {
    setConfirmDialog({
      open: true, variant: 'warning',
      title: 'Cerrar turno',
      message: '¿Cerrar el turno ahora? Se generará el resumen de cobranza.',
      confirmLabel: 'Cerrar turno',
      onConfirm: async () => {
        setConfirmRunning(true);
        setCerrando(true);
        try {
          const cerrado = await cerrarTurno();
          setTurno(cerrado);
          setSuccess('Turno cerrado correctamente.');
          if (isAdmin) setHistorial(await getCashCloses());
          closeConfirm();
        } catch {
          setError('Error al cerrar el turno.');
          closeConfirm();
        } finally {
          setCerrando(false);
        }
      },
    });
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      {}
      <div className="flex items-center gap-3">
        <DollarSign className="w-6 h-6 text-indigo-600" />
        <h1 className="text-xl font-bold text-gray-900">Caja / Turno de Cobros</h1>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400">✕</button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          <CheckCircle2 className="w-4 h-4" /> {success}
        </div>
      )}

      {}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { key: 'turno',    label: 'Mi Turno',  icon: Clock },
          { key: 'historial', label: 'Historial', icon: History },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {}
      {tab === 'turno' && turno && (
        <div className="space-y-4">
          {}
          <div className={`rounded-xl p-5 border-2 ${
            turno.IsClosed
              ? 'bg-gray-50 border-gray-200'
              : 'bg-indigo-50 border-indigo-300'
          }`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-gray-500">Estado del turno</p>
                <p className={`text-lg font-bold mt-0.5 ${
                  turno.IsClosed ? 'text-gray-700' : 'text-indigo-700'
                }`}>
                  {turno.IsClosed ? 'Cerrado' : '🟢 Abierto'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">Inicio</p>
                <p className="font-mono text-sm">
                  {new Date(turno.StartedAt).toLocaleString('es-BO')}
                </p>
                {turno.ClosedAt && (
                  <>
                    <p className="text-sm text-gray-500 mt-1">Cierre</p>
                    <p className="font-mono text-sm">
                      {new Date(turno.ClosedAt).toLocaleString('es-BO')}
                    </p>
                  </>
                )}
              </div>
            </div>

            {}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-white rounded-lg p-3 text-center border border-gray-100 shadow-sm">
                <p className="text-2xl font-bold text-gray-900">Bs. {fmt(turno.TotalAmount)}</p>
                <p className="text-xs text-gray-500 mt-0.5">Total recaudado</p>
              </div>
              <div className="bg-white rounded-lg p-3 text-center border border-gray-100 shadow-sm">
                <p className="text-2xl font-bold text-green-700">{turno.PagosValidados}</p>
                <p className="text-xs text-gray-500 mt-0.5">Pagos registrados</p>
              </div>
              <div className="bg-white rounded-lg p-3 text-center border border-gray-100 shadow-sm">
                <p className="text-2xl font-bold text-red-600">{turno.PagosRechazados}</p>
                <p className="text-xs text-gray-500 mt-0.5">Rechazados</p>
              </div>
            </div>

            {}
            {turno.Detalle.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Desglose por método
                </p>
                {turno.Detalle.map((d) => (
                  <div key={d.Method}
                    className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        METHOD_COLORS[d.Method] ?? 'bg-gray-100 text-gray-700'
                      }`}>
                        {d.Method}
                      </span>
                      <span className="text-sm text-gray-500">{d.Cantidad} pago(s)</span>
                    </div>
                    <span className="font-semibold text-gray-900">Bs. {fmt(d.Monto)}</span>
                  </div>
                ))}
              </div>
            )}

            {}
            {!turno.IsClosed && (
              <div className="mt-5 pt-4 border-t border-indigo-200">
                <button
                  onClick={handleCerrarTurno}
                  disabled={cerrando}
                  className="flex items-center gap-2 w-full justify-center bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white px-4 py-2.5 rounded-lg text-sm font-medium"
                >
                  {cerrando
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <LogOut className="w-4 h-4" />}
                  Cerrar turno
                </button>
                <p className="text-xs text-center text-indigo-600 mt-2">
                  Los montos se actualizan en tiempo real mientras el turno esté abierto.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {}
      {tab === 'historial' && (
        <div className="space-y-3">
          {!isAdmin ? (
            <p className="text-sm text-gray-500 text-center py-8">
              Solo los administradores pueden ver el historial completo.
            </p>
          ) : historial.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No hay cierres registrados.</p>
          ) : (
            historial.map(cc => (
              <div key={cc.Id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-gray-400" />
                      <p className="font-medium text-sm text-gray-900">{cc.OperatorName}</p>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(cc.StartedAt).toLocaleString('es-BO')}
                      {' → '}
                      {cc.ClosedAt ? new Date(cc.ClosedAt).toLocaleString('es-BO') : '(abierto)'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-gray-900">Bs. {fmt(cc.TotalAmount)}</p>
                    <p className="text-xs text-gray-500">{cc.PagosValidados} pagos</p>
                  </div>
                </div>
                {cc.Detalle.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {cc.Detalle.map(d => (
                      <span key={d.Method}
                        className={`text-xs px-2 py-1 rounded-full font-medium ${
                          METHOD_COLORS[d.Method] ?? 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {d.Method}: Bs. {fmt(d.Monto)} ({d.Cantidad})
                      </span>
                    ))}
                  </div>
                )}
                {cc.PdfPath && (
                  <a href={cc.PdfPath} target="_blank" rel="noreferrer"
                    className="mt-3 flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800">
                    <Download className="w-3.5 h-3.5" /> Descargar PDF del cierre
                  </a>
                )}
              </div>
            ))
          )}
        </div>
      )}

      <ConfirmDialog state={confirmDialog} onClose={closeConfirm} running={confirmRunning} />
    </div>
  );
}
