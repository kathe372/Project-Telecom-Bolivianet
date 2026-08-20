import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Loader2, AlertCircle, CheckCircle2, XCircle, RefreshCw, ArrowLeft, Check } from 'lucide-react';
import { planChangeService } from '@/services/clientService';
import type { PlanChangeRequestDto } from '@/types/client.types';
import { extractApiError } from '@/utils/apiError';


function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

export default function PlanChangePage() {
  const [searchParams] = useSearchParams();
  const clientIdFilter = searchParams.get('clientId');
  const [items,       setItems]       = useState<PlanChangeRequestDto[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [success,     setSuccess]     = useState('');
  const [acting,      setActing]      = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectMotivo, setRejectMotivo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await planChangeService.getPending(clientIdFilter));
    } catch {
      setError('No se pudo cargar la lista de solicitudes.');
    } finally {
      setLoading(false);
    }
  }, [clientIdFilter]);

  useEffect(() => { load(); }, [load]);

  const approve = async (id: string, midMonth: boolean) => {
    setActing(id); setSuccess(''); setError('');
    try {
      await planChangeService.approve(id, midMonth);
      setSuccess(midMonth
        ? 'Cambio aplicado inmediatamente. Facturas proporcionales generadas.'
        : 'Cambio aprobado. Será efectivo el 1ro del mes siguiente.');
      load();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Error al aprobar.'));
    } finally {
      setActing(null);
    }
  };

  const confirmReject = async (id: string) => {
    if (!rejectMotivo.trim()) return;
    setActing(id); setSuccess(''); setError('');
    try {
      await planChangeService.reject(id, rejectMotivo.trim());
      setSuccess('Solicitud rechazada correctamente.');
      setRejectingId(null); setRejectMotivo('');
      load();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Error al rechazar.'));
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">

      {}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-start gap-3">
          {clientIdFilter && (
            <Link
              to={`/clients/${clientIdFilter}`}
              className="mt-0.5 p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title="Volver al perfil del cliente"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
          )}
          <div>
            <h1 className="text-xl font-medium text-gray-900">Cambios de plan</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {clientIdFilter
                ? `Solicitudes del cliente — ${items.length} pendiente(s)`
                : `Solicitudes pendientes de aprobación — ${items.length} en cola`}
            </p>
          </div>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className="w-4 h-4" />
          Actualizar
        </button>
      </div>

      {}
      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 text-green-700 text-sm mb-4 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0" /> {success}
        </div>
      )}

      {}
      <div className="bg-white border rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            No hay solicitudes de cambio de plan pendientes.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Cliente</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Plan actual</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Plan nuevo</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Fecha efectiva</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Solicitado</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((r) => {
                const isActing = acting === r.Id;
                return (
                  <tr key={r.Id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{r.ClienteNombre}</p>
                      <p className="text-xs text-gray-400">{r.ClienteTbn}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.PlanAnterior}</td>
                    <td className="px-4 py-3">
                      <StatusBadge label={r.PlanNuevo} color="bg-blue-50 text-blue-800" />
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{r.FechaEfectiva}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(r.SolicitadoAt).toLocaleDateString('es-BO')}
                      {r.Notes && (
                        <p className="text-gray-400 mt-0.5 italic truncate max-w-[120px]" title={r.Notes}>
                          {r.Notes}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => approve(r.Id, false)}
                          disabled={isActing}
                          className="flex items-center gap-1 px-2.5 py-1 bg-green-100 text-green-800 text-xs rounded-lg hover:bg-green-200 disabled:opacity-50"
                          title="Aprobar para el 1ro del mes siguiente"
                        >
                          {isActing ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                          Fin de mes
                        </button>
                        <button
                          onClick={() => approve(r.Id, true)}
                          disabled={isActing}
                          className="flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-800 text-xs rounded-lg hover:bg-blue-200 disabled:opacity-50"
                          title="Aplicar ahora con facturas proporcionales"
                        >
                          {isActing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                          Ahora
                        </button>
                        {rejectingId === r.Id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              className="border border-gray-300 rounded px-1.5 py-0.5 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-red-400"
                              placeholder="Motivo..."
                              autoFocus
                              value={rejectMotivo}
                              onChange={e => setRejectMotivo(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') confirmReject(r.Id); if (e.key === 'Escape') { setRejectingId(null); setRejectMotivo(''); } }}
                            />
                            <button
                              onClick={() => confirmReject(r.Id)}
                              disabled={!rejectMotivo.trim() || isActing}
                              className="p-1 bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50"
                              title="Confirmar rechazo"
                            >
                              {isActing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            </button>
                            <button
                              onClick={() => { setRejectingId(null); setRejectMotivo(''); }}
                              className="p-1 text-gray-400 hover:text-gray-600 rounded"
                              title="Cancelar"
                            >
                              <XCircle className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setRejectingId(r.Id)}
                            disabled={isActing}
                            className="flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-700 text-xs rounded-lg hover:bg-red-200 disabled:opacity-50"
                          >
                            <XCircle className="w-3 h-3" />
                            Rechazar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {}
      <div className="mt-4 text-xs text-gray-400 space-y-1">
        <p>"Fin de mes" — el plan cambia el 1ro del mes siguiente, factura completa del nuevo plan.</p>
        <p>"Ahora" — el plan cambia inmediatamente, se generan facturas proporcionales por los días con cada plan.</p>
      </div>
    </div>
  );
}
