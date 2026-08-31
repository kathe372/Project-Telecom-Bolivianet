import { useCallback, useState, useRef, useEffect } from 'react';
import {
  X, CalendarClock, Info, MessageSquare, Paperclip, History, MapPin,
} from 'lucide-react';
import { ticketService } from '@/services/ticketService';
import { cannedResponseService } from '@/services/cannedResponseService';
import type { TicketDetailDto, CommentType, TicketActivityDto, CannedResponseDto } from '@/types/ticket.types';
import type { UserSystemDto } from '@/types/auth.types';
import { NEXT_STATUS, priorityBadge, statusBadge } from './ticketHelpers';
import { extractApiError } from '@/utils/apiError';
import { TicketAttachmentsTab } from './TicketAttachmentsTab';
import { InfoTab } from './detail/InfoTab';
import { CommentsTab } from './detail/CommentsTab';
import { VisitsTab } from './detail/VisitsTab';
import { HistoryTab } from './detail/HistoryTab';

interface Props {
  ticket:      TicketDetailDto;
  technicians: UserSystemDto[];
  isAdmin:     boolean;
  onClose:     () => void;
  onRefresh:   () => void;
}

export function TicketDetailModal({ ticket, technicians, isAdmin, onClose, onRefresh }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => { dialogRef.current?.focus(); }, []);
  const [detail, setDetail] = useState<TicketDetailDto>(ticket);
  const [saving, setSaving]   = useState(false);
  const [errMsg, setErrMsg]   = useState('');
  const [warnMsg, setWarnMsg] = useState(ticket.WhatsAppWarning ?? '');
  const [tab, setTab]         = useState<'info' | 'comments' | 'visits' | 'attachments' | 'history'>('info');

  const [commentType, setCommentType] = useState<CommentType>('NotaInterna');
  const [commentBody, setCommentBody] = useState('');
  const [visitDate, setVisitDate]   = useState('');
  const [visitTech, setVisitTech]   = useState('');
  const [visitObs,  setVisitObs]    = useState('');
  const [resolveMsg, setResolveMsg] = useState('');
  const [lightbox, setLightbox]   = useState(false);

  const [activity,      setActivity]      = useState<TicketActivityDto[]>([]);
  const [activityLoaded, setActivityLoaded] = useState(false);
  const [activityFallo,  setActivityFallo]  = useState(false);

  const [cannedResponses, setCannedResponses] = useState<CannedResponseDto[]>([]);
  const [showCanned,      setShowCanned]      = useState(false);

  const nexts   = NEXT_STATUS[detail.Status] ?? [];
  const technician = technicians.find(t => t.Id === detail.AssignedToUserId);

  const cargarActividad = useCallback(() => {
    setActivityFallo(false);
    ticketService.getActivity(detail.Id).then(data => {
      setActivity(data);
      setActivityLoaded(true);
    }).catch(() => {
      // Antes se tragaba y `activityLoaded` no llegaba a true nunca: la pestaña
      // se quedaba con el spinner girando indefinidamente.
      setActivityFallo(true);
    });
  }, [detail.Id]);

  useEffect(() => {
    if (tab === 'history' && !activityLoaded && !activityFallo) cargarActividad();
  }, [tab, activityLoaded, activityFallo, cargarActividad]);

  useEffect(() => {
    if (tab === 'comments' && cannedResponses.length === 0) {
      // Silencio deliberado: las respuestas predefinidas son un atajo para
      // escribir, no el contenido del ticket. Sin ellas se escribe a mano.
      cannedResponseService.getAll().then(setCannedResponses).catch(() => {  });
    }
  }, [tab, cannedResponses.length]);

  const reload = async () => {
    try { setDetail(await ticketService.getById(detail.Id)); }
    catch {
      // Se tragaba, y la pantalla seguía mostrando el estado anterior: el
      // usuario creía que su cambio no se había aplicado y volvía a intentarlo.
      // El cambio SÍ se guardó; lo que falló es releerlo.
      setErrMsg('El cambio se guardó, pero no pudimos recargar el ticket. Ciérralo y vuelve a abrirlo para ver el estado actual.');
    }
  };

  const handleStatus = async (newStatus: string) => {
    if (newStatus === 'Resuelto' && !resolveMsg.trim()) {
      setErrMsg('Ingresa un mensaje de resolución antes de marcar como resuelto.');
      return;
    }
    setSaving(true); setErrMsg(''); setWarnMsg('');
    try {
      const updated = await ticketService.changeStatus(detail.Id, {
        Status: newStatus,
        ResolutionMessage: newStatus === 'Resuelto' ? resolveMsg.trim() : undefined,
      });
      setDetail(updated);
      setWarnMsg(updated.WhatsAppWarning ?? '');
      onRefresh();
    } catch (e: unknown) {
      setErrMsg(extractApiError(e, 'Error al cambiar estado.'));
    } finally { setSaving(false); }
  };

  const handleClose = async () => {
    setSaving(true); setErrMsg('');
    try {
      const updated = await ticketService.close(detail.Id);
      setDetail(updated); onRefresh();
    } catch (e: unknown) {
      setErrMsg(extractApiError(e, 'Error al cerrar.'));
    } finally { setSaving(false); }
  };

  const handleAssign = async (techId: string) => {
    setSaving(true); setErrMsg(''); setWarnMsg('');
    try {
      const updated = await ticketService.assign(detail.Id, { TechnicianId: techId });
      setDetail(updated);
      setWarnMsg(updated.WhatsAppWarning ?? '');
      onRefresh();
    } catch (e: unknown) {
      setErrMsg(extractApiError(e, 'Error al asignar.'));
    } finally { setSaving(false); }
  };

  const handleAddComment = async () => {
    if (!commentBody.trim()) return;
    setSaving(true); setErrMsg('');
    try {
      await ticketService.addComment(detail.Id, { Type: commentType, Body: commentBody.trim() });
      setCommentBody('');
      await reload();
    } catch (e: unknown) {
      setErrMsg(extractApiError(e, 'Error al guardar comentario.'));
    } finally { setSaving(false); }
  };

  const handleScheduleVisit = async () => {
    if (!visitDate) { setErrMsg('Selecciona fecha y hora de la visita.'); return; }
    setSaving(true); setErrMsg('');
    try {
      await ticketService.scheduleVisit(detail.Id, {
        ScheduledAt: new Date(visitDate).toISOString(),
        TechnicianId: visitTech || undefined,
        Observations: visitObs.trim() || undefined,
      });
      setVisitDate(''); setVisitTech(''); setVisitObs('');
      await reload();
    } catch (e: unknown) {
      setErrMsg(extractApiError(e, 'Error al programar visita.'));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="ticket-detail-modal-title" tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }} className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col outline-none">

        <div className="flex items-start justify-between p-5 border-b border-gray-100 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {statusBadge(detail.Status)}
              {priorityBadge(detail.Priority)}
              {detail.SupportGroup && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                  {detail.SupportGroup}
                </span>
              )}
            </div>
            <h2 id="ticket-detail-modal-title" className="text-base font-bold text-gray-900 leading-tight">{detail.Subject}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {detail.ClientName} · {detail.ClientTbn}
              {detail.TicketNumber && (
                <span className="ml-2 font-mono text-gray-500">{detail.TicketNumber}</span>
              )}
            </p>
            {(detail.ClientId || detail.ProspectIdentityCard || detail.ClientZone
              || detail.ClientStreet || detail.ClientGpsLatitude) && (
              <div className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                {[detail.ClientZone, detail.ClientStreet, detail.ClientLocationRef]
                  .filter(Boolean).length > 0 && (
                  <span>📍 {[detail.ClientZone, detail.ClientStreet, detail.ClientLocationRef]
                    .filter(Boolean).join(' · ')}</span>
                )}
                {detail.ClientPhone && <span>📞 {detail.ClientPhone}</span>}
                {/* Datos de prospecto (tickets sin cliente registrado, generados
                    por el bot al agendar una instalación) */}
                {detail.ProspectIdentityCard && <span>🪪 CI: {detail.ProspectIdentityCard}</span>}
                {detail.ProspectBackupPhone  && <span>☎️ Respaldo: {detail.ProspectBackupPhone}</span>}
                {detail.InstallationBoxCode && (
                  <span>📦 Caja NAP: {detail.InstallationBoxCode}
                    {detail.InstallationZoneName ? ` · Zona: ${detail.InstallationZoneName}` : ''}</span>
                )}
                {detail.ClientPlanName && <span>📶 {detail.ClientPlanName}</span>}
                {detail.ClientGpsLatitude && detail.ClientGpsLongitude && (
                  <>
                    <a
                      href={`https://www.google.com/maps?q=${detail.ClientGpsLatitude},${detail.ClientGpsLongitude}`}
                      target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800"
                    >
                      <MapPin className="w-3 h-3" /> Ver en Google Maps
                    </a>
                    <a
                      href={`/coverage?lat=${detail.ClientGpsLatitude}&lng=${detail.ClientGpsLongitude}`}
                      target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800"
                    >
                      <MapPin className="w-3 h-3" /> Ver en mapa de cobertura
                    </a>
                  </>
                )}
              </div>
            )}
          </div>
          <button onClick={onClose} className="ml-3 text-gray-400 hover:text-gray-600 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-gray-100 shrink-0 overflow-x-auto">
          {([
            { key: 'info',        label: 'Información',                        icon: Info },
            { key: 'comments',    label: `Notas (${detail.Comments.length})`,  icon: MessageSquare },
            { key: 'visits',      label: `Visitas (${detail.Visits.length})`,  icon: CalendarClock },
            { key: 'attachments', label: 'Adjuntos',                           icon: Paperclip },
            { key: 'history',     label: 'Historial',                          icon: History },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors
                ${tab === key ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {tab === 'info' && (
            <InfoTab
              detail={detail}
              isAdmin={isAdmin}
              technicians={technicians}
              technician={technician}
              saving={saving}
              nexts={nexts}
              resolveMsg={resolveMsg}
              onResolveMsgChange={setResolveMsg}
              warnMsg={warnMsg}
              errMsg={errMsg}
              onAssign={handleAssign}
              onStatus={handleStatus}
              onCloseTicket={handleClose}
              onImageClick={() => setLightbox(true)}
            />
          )}

          {tab === 'comments' && (
            <CommentsTab
              detail={detail}
              commentType={commentType}
              onCommentTypeChange={setCommentType}
              commentBody={commentBody}
              onCommentBodyChange={setCommentBody}
              cannedResponses={cannedResponses}
              showCanned={showCanned}
              onToggleCanned={() => setShowCanned(v => !v)}
              onSelectCanned={(body) => { setCommentBody(body); setShowCanned(false); }}
              onAddComment={handleAddComment}
              saving={saving}
              errMsg={errMsg}
            />
          )}

          {tab === 'attachments' && (
            <TicketAttachmentsTab ticketId={detail.Id} isReadOnly={detail.Status === 'Cerrado'} />
          )}

          {tab === 'history' && (
            <HistoryTab
              activity={activity}
              activityLoaded={activityLoaded}
              fallo={activityFallo}
              onReintentar={cargarActividad}
            />
          )}

          {tab === 'visits' && (
            <VisitsTab
              detail={detail}
              technicians={technicians}
              visitDate={visitDate}
              onVisitDate={setVisitDate}
              visitTech={visitTech}
              onVisitTech={setVisitTech}
              visitObs={visitObs}
              onVisitObs={setVisitObs}
              onScheduleVisit={handleScheduleVisit}
              saving={saving}
              errMsg={errMsg}
            />
          )}
        </div>
      </div>

      {lightbox && detail.ImageUrl && (
        <div
          className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(false)}
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white"
            onClick={() => setLightbox(false)}
          >
            <X className="w-7 h-7" />
          </button>
          <img
            src={detail.ImageUrl}
            alt="Imagen técnica del cliente (ampliada)"
            className="max-w-full max-h-full rounded-lg shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
