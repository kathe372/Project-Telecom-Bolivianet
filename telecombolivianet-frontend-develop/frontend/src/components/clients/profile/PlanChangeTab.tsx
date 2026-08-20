import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle, Calendar, ClipboardList, Clock, Loader2, RefreshCw, Wifi,
} from 'lucide-react';
import { planService, planChangeService } from '@/services/clientService';
import { extractApiError } from '@/utils/apiError';
import type {
  PlanDto, PlanChangeRequestDto, PlanChangeHistoryDto,
} from '@/types/client.types';

export function PlanChangeTab({
  clientId, currentPlanId, currentPlanName, isAdmin, onPlanChanged,
}: {
  clientId: string;
  currentPlanId: string;
  currentPlanName: string;
  isAdmin: boolean;
  onPlanChanged: () => void;
}) {
  const [plans,        setPlans]        = useState<PlanDto[]>([]);
  const [pending,      setPending]      = useState<PlanChangeRequestDto[]>([]);
  const [historial,    setHistorial]    = useState<PlanChangeHistoryDto[]>([]);
  const [newPlan,      setNewPlan]      = useState('');
  const [notes,        setNotes]        = useState('');
  const [loading,      setLoading]      = useState(true);
  const [sending,      setSending]      = useState(false);
  const [error,        setError]        = useState('');
  const [success,      setSuccess]      = useState('');
  const [rejectingId,  setRejectingId]  = useState<string | null>(null);
  const [rejectMotivo, setRejectMotivo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [allPlans, pendingList, historialList] = await Promise.all([
        planService.getAll(true),
        planChangeService.getPending(clientId),
        planChangeService.getHistorial(clientId),
      ]);
      setPlans(allPlans.filter((p: PlanDto) => p.Id !== currentPlanId));
      setPending(pendingList);
      setHistorial(historialList);
    } catch {
      setError('Error cargando datos.');
    } finally {
      setLoading(false);
    }
  }, [clientId, currentPlanId]);

  useEffect(() => { load(); }, [load]);

  const handleRequest = async () => {
    if (!newPlan) { setError('Selecciona un plan.'); return; }
    setSending(true); setError(''); setSuccess('');
    try {
      await planChangeService.request(clientId, newPlan, notes || undefined);
      setSuccess('Solicitud enviada. El admin la revisará.');
      setNewPlan(''); setNotes('');
      load();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Error al enviar la solicitud.'));
    } finally {
      setSending(false);
    }
  };

  const handleApprove = async (id: string, midMonth: boolean) => {
    try {
      await planChangeService.approve(id, midMonth);
      setSuccess(midMonth ? 'Cambio aplicado inmediatamente.' : 'Aprobado. Efectivo el 1ro del mes.');
      onPlanChanged();
      load();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Error al aprobar.'));
    }
  };

  const handleReject = async (id: string) => {
    if (rejectMotivo.trim().length < 3) return;
    try {
      await planChangeService.reject(id, rejectMotivo);
      setSuccess('Solicitud rechazada.');
      setRejectingId(null); setRejectMotivo('');
      onPlanChanged();
      load();
    } catch {
      setError('Error al rechazar.');
    }
  };

  if (loading) return <div className="card p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>;

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Wifi className="w-4 h-4" /> Plan actual
        </h3>
        <p className="text-sm text-gray-700 font-medium">{currentPlanName}</p>
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Solicitar cambio de plan
        </h3>
        <div className="space-y-3">
          {pending.length > 0 && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
              <Clock className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Ya existe una solicitud pendiente de cambio de plan.
                Debe ser aprobada o rechazada por el administrador antes de poder enviar una nueva.
              </span>
            </div>
          )}

          {plans.length === 0 && pending.length === 0 && (
            <div className="flex items-start gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-500 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>No hay otros planes disponibles para seleccionar. Contacta al administrador.</span>
            </div>
          )}

          {plans.length > 0 && pending.length === 0 && (
            <>
              <select
                value={newPlan}
                onChange={(e) => setNewPlan(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                <option value="">Seleccionar nuevo plan...</option>
                {plans.map((p) => (
                  <option key={p.Id} value={p.Id}>
                    {p.Name} — {p.SpeedMb} Mb — Bs. {p.MonthlyPrice}/mes
                  </option>
                ))}
              </select>
              <textarea
                rows={2}
                placeholder="Notas opcionales..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm w-full resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              {error   && <p className="text-xs text-red-600">{error}</p>}
              {success && <p className="text-xs text-green-600">{success}</p>}
              <button
                onClick={handleRequest}
                disabled={sending || !newPlan}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {sending && <Loader2 className="w-3 h-3 animate-spin" />}
                Enviar solicitud
              </button>
              <p className="text-xs text-gray-400">
                Los cambios son efectivos el 1ro del mes siguiente. El admin puede aprobar inmediatamente con factura proporcional.
              </p>
            </>
          )}

          {error && pending.length === 0 && plans.length === 0 && (
            <p className="text-xs text-red-600">{error}</p>
          )}
          {success && <p className="text-xs text-green-600">{success}</p>}
        </div>
      </div>

      {isAdmin && pending.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4" /> Solicitudes pendientes
          </h3>
          <div className="space-y-3">
            {pending.map((r) => (
              <div key={r.Id} className="border rounded-lg p-3 text-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{r.PlanAnterior} → {r.PlanNuevo}</span>
                  <span className="text-xs text-gray-400">{new Date(r.SolicitadoAt).toLocaleDateString('es-BO')}</span>
                </div>
                {r.Notes && <p className="text-xs text-gray-500 mb-2">{r.Notes}</p>}
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => handleApprove(r.Id, false)}
                    className="px-3 py-1 bg-green-100 text-green-800 text-xs rounded-lg hover:bg-green-200"
                  >
                    Aprobar (fin de mes)
                  </button>
                  <button
                    onClick={() => handleApprove(r.Id, true)}
                    className="px-3 py-1 bg-blue-100 text-blue-800 text-xs rounded-lg hover:bg-blue-200"
                  >
                    Aplicar ahora (proporcional)
                  </button>
                  {rejectingId !== r.Id && (
                    <button
                      onClick={() => { setRejectingId(r.Id); setRejectMotivo(''); }}
                      className="px-3 py-1 bg-red-100 text-red-700 text-xs rounded-lg hover:bg-red-200"
                    >
                      Rechazar
                    </button>
                  )}
                </div>
                {rejectingId === r.Id && (
                  <div className="mt-2 space-y-2">
                    <textarea
                      rows={2}
                      className="border rounded-lg px-3 py-2 text-sm w-full resize-none focus:outline-none focus:ring-2 focus:ring-red-300"
                      placeholder="Motivo del rechazo (mínimo 3 caracteres)..."
                      value={rejectMotivo}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRejectMotivo(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReject(r.Id)}
                        disabled={rejectMotivo.trim().length < 3}
                        className="px-3 py-1 bg-red-100 text-red-700 text-xs rounded-lg hover:bg-red-200 disabled:opacity-40"
                      >
                        Confirmar rechazo
                      </button>
                      <button
                        onClick={() => { setRejectingId(null); setRejectMotivo(''); }}
                        className="px-3 py-1 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <ClipboardList className="w-4 h-4" /> Historial de cambios de plan
        </h3>
        {historial.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-3">Sin historial de cambios.</p>
        ) : (
          <div className="space-y-2">
            {historial.map((h) => {
              const statusCls =
                h.Status === 'Aplicado'   ? 'bg-green-100 text-green-800' :
                // Aprobado ≠ aplicado: un downgrade aprobado sigue esperando su fecha efectiva,
                // así que se muestra en azul (en curso) y no en verde (hecho).
                h.Status === 'Aprobado'   ? 'bg-blue-100 text-blue-800'   :
                h.Status === 'Rechazado'  ? 'bg-red-100 text-red-700'     :
                h.Status === 'Cancelado'  ? 'bg-gray-100 text-gray-500'   :
                                            'bg-amber-100 text-amber-800';
              return (
                <div key={h.Id} className="border rounded-lg p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-800">
                      {h.PlanAnterior} → {h.PlanNuevo}
                    </span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusCls}`}>
                      {h.Status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                    <span>Solicitado: {new Date(h.SolicitadoAt).toLocaleDateString('es-BO')}</span>
                    <span>Efectivo: {new Date(h.FechaEfectiva).toLocaleDateString('es-BO')}</span>
                    {h.MidMonthChange && <span className="text-blue-600">Cambio inmediato</span>}
                    {h.ProcesadoAt && (
                      <span>Procesado: {new Date(h.ProcesadoAt).toLocaleDateString('es-BO')}</span>
                    )}
                  </div>
                  {h.MotivoRechazo && (
                    <p className="text-xs text-red-600 mt-1">Motivo: {h.MotivoRechazo}</p>
                  )}
                  {h.Notes && (
                    <p className="text-xs text-gray-400 italic">{h.Notes}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
