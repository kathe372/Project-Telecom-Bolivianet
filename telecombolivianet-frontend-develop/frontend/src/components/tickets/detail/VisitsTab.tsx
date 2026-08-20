import { Loader2, AlertCircle, CalendarClock, User, MapPin } from 'lucide-react';
import type { TicketDetailDto } from '@/types/ticket.types';
import type { UserSystemDto } from '@/types/auth.types';
import { fmtMs, getSlaInfo } from '../ticketHelpers';

export function VisitsTab({
  detail, technicians, visitDate, onVisitDate, visitTech, onVisitTech,
  visitObs, onVisitObs, onScheduleVisit, saving, errMsg,
}: {
  detail: TicketDetailDto;
  technicians: UserSystemDto[];
  visitDate: string;
  onVisitDate: (v: string) => void;
  visitTech: string;
  onVisitTech: (v: string) => void;
  visitObs: string;
  onVisitObs: (v: string) => void;
  onScheduleVisit: () => void;
  saving: boolean;
  errMsg: string;
}) {
  // Conflicto SLA vs. fecha de visita elegida: agendar una visita para después
  // de que el SLA venza no rompe nada técnicamente, pero es una trampa fácil de
  // no notar (ej. "la instalación es el jueves" con el SLA venciendo el martes).
  const slaDeadlineIso = detail.SlaDeadline ?? detail.DueDate;
  const slaInfo = getSlaInfo(detail);
  const visitAfterSla = !!(
    visitDate && slaDeadlineIso &&
    new Date(visitDate).getTime() > new Date(slaDeadlineIso).getTime()
  );

  return (
    <>
      {detail.Visits.length === 0
        ? <p className="text-sm text-gray-400 text-center py-8">Sin visitas programadas.</p>
        : (
          <div className="space-y-3">
            {detail.Visits.map(v => {
              const visitStatusCls: Record<string, string> = {
                Programada:  'bg-indigo-100 text-indigo-700',
                Completada:  'bg-green-100 text-green-700',
                Cancelada:   'bg-red-100 text-red-600',
              };
              const gpsUrl = detail.ClientGpsLatitude && detail.ClientGpsLongitude
                ? `https://www.google.com/maps?q=${detail.ClientGpsLatitude},${detail.ClientGpsLongitude}`
                : null;
              return (
                <div key={v.Id} className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-sm">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <CalendarClock className="w-4 h-4 text-indigo-500" />
                      <span className="font-semibold text-indigo-800">{new Date(v.ScheduledAt).toLocaleString('es-BO')}</span>
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${visitStatusCls[v.Status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {v.Status}
                    </span>
                  </div>
                  {v.TechnicianName && (
                    <p className="text-xs text-gray-600 flex items-center gap-1"><User className="w-3 h-3" />{v.TechnicianName}</p>
                  )}
                  {v.Observations && <p className="text-xs text-gray-500 mt-1">{v.Observations}</p>}
                  {gpsUrl && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                      <a
                        href={gpsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
                      >
                        <MapPin className="w-3 h-3" />
                        Ver en Google Maps
                      </a>
                      <a
                        href={`/coverage?lat=${detail.ClientGpsLatitude}&lng=${detail.ClientGpsLongitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
                      >
                        <MapPin className="w-3 h-3" />
                        Ver en mapa de cobertura
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      {detail.Status !== 'Cerrado' && (
        <div className="border-t border-gray-100 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Programar visita técnica</p>
            <span className={`text-xs ${slaInfo.color}`}>SLA: {slaInfo.label}</span>
          </div>
          <div>
            <label className="label">Fecha y hora *</label>
            <input type="datetime-local" className="input-field"
              value={visitDate} onChange={e => onVisitDate(e.target.value)} />
            {visitAfterSla && (
              <p className="text-xs text-red-600 flex items-center gap-1 mt-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                Esta fecha queda {fmtMs(new Date(visitDate).getTime() - new Date(slaDeadlineIso!).getTime())} después
                del vencimiento del SLA — el ticket puede quedar incumplido antes de que el técnico llegue.
              </p>
            )}
          </div>
          <div>
            <label className="label">Técnico (si difiere del gestor)</label>
            <select className="input-field" value={visitTech} onChange={e => onVisitTech(e.target.value)}>
              <option value="">— Mismo del ticket —</option>
              {technicians.map(t => <option key={t.Id} value={t.Id}>{t.FullName}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Observaciones (equipos, acceso, contacto)</label>
            <textarea className="input-field resize-none" rows={3} maxLength={1000}
              placeholder="Equipos a llevar, datos de acceso, contacto en sitio..."
              value={visitObs} onChange={e => onVisitObs(e.target.value)} />
          </div>
          <div className="flex justify-end">
            <button className="btn-primary" onClick={onScheduleVisit} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
              Programar visita
            </button>
          </div>
          {errMsg && <p className="text-sm text-red-600 flex items-center gap-1.5"><AlertCircle className="w-4 h-4" />{errMsg}</p>}
        </div>
      )}
    </>
  );
}
