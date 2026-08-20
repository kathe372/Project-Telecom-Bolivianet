import {
  Loader2, AlertCircle, Lock, AlertTriangle, User, ZoomIn,
} from 'lucide-react';
import type { TicketDetailDto } from '@/types/ticket.types';
import type { UserSystemDto } from '@/types/auth.types';
import { TICKET_TYPES, STATUS_LABELS } from '../ticketHelpers';
import { SlaProgressBar } from '../SlaProgressBar';

export function InfoTab({
  detail, isAdmin, technicians, technician, saving, nexts,
  resolveMsg, onResolveMsgChange, warnMsg, errMsg,
  onAssign, onStatus, onCloseTicket, onImageClick,
}: {
  detail: TicketDetailDto;
  isAdmin: boolean;
  technicians: UserSystemDto[];
  technician: UserSystemDto | undefined;
  saving: boolean;
  nexts: string[];
  resolveMsg: string;
  onResolveMsgChange: (v: string) => void;
  warnMsg: string;
  errMsg: string;
  onAssign: (techId: string) => void;
  onStatus: (newStatus: string) => void;
  onCloseTicket: () => void;
  onImageClick: () => void;
}) {
  return (
    <>
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Descripción</p>
        <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">{detail.Description}</p>
      </div>

      {detail.ImageUrl && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Imagen del cliente</p>
          <div className="relative inline-block group cursor-zoom-in" onClick={onImageClick}>
            <img
              src={detail.ImageUrl}
              alt="Imagen técnica enviada por el cliente"
              className="rounded-lg border border-gray-200 max-h-52 object-contain"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-lg transition-colors flex items-center justify-center">
              <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-sm">
        {[
          ['Tipo', TICKET_TYPES[detail.Type] ?? detail.Type],
          ['Origen', detail.Origin],
          ['Creado por', detail.CreatedByName],
          ['Creado el', new Date(detail.CreatedAt).toLocaleString('es-BO')],
          detail.DueDate ? ['Vence el', new Date(detail.DueDate).toLocaleString('es-BO')] : null,
          detail.FirstRespondedAt ? ['1ª respuesta', new Date(detail.FirstRespondedAt).toLocaleString('es-BO')] : null,
          detail.ResolvedAt ? ['Resuelto el', new Date(detail.ResolvedAt).toLocaleString('es-BO')] : null,
          detail.ClosedAt ? ['Cerrado el', new Date(detail.ClosedAt).toLocaleString('es-BO')] : null,
        ].filter((row): row is string[] => row !== null).map(([label, value]) => (
          <div key={label as string}>
            <p className="text-xs text-gray-400">{label as string}</p>
            <p className="font-medium text-gray-700">{value as string}</p>
          </div>
        ))}
        {detail.SlaCompliant !== null && (
          <div>
            <p className="text-xs text-gray-400">SLA</p>
            <p className={`font-semibold text-sm ${detail.SlaCompliant ? 'text-green-600' : 'text-red-500'}`}>
              {detail.SlaCompliant ? '✓ Cumplido' : '✗ Incumplido'}
            </p>
          </div>
        )}
      </div>

      {(detail.SlaDeadline || detail.SlaCompliant !== null) && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">SLA</p>
          <SlaProgressBar
            slaDeadline={detail.SlaDeadline}
            slaPausedAt={detail.SlaPausedAt ?? null}
            slaTotalPausedMinutes={detail.SlaTotalPausedMinutes}
            status={detail.Status}
            slaCompliant={detail.SlaCompliant}
            createdAt={detail.CreatedAt}
          />
        </div>
      )}

      {detail.ResolutionMessage && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Resolución</p>
          <p className="text-sm text-gray-700 bg-green-50 border border-green-100 rounded-lg p-3">{detail.ResolutionMessage}</p>
        </div>
      )}

      {detail.RootCause && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Causa raíz</p>
          <p className="text-sm text-gray-700 bg-purple-50 border border-purple-100 rounded-lg p-3">{detail.RootCause}</p>
        </div>
      )}

      {isAdmin && detail.Status !== 'Cerrado' && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Técnico asignado</p>
          <select className="input-field" value={detail.AssignedToUserId ?? ''}
            onChange={e => { if (e.target.value) onAssign(e.target.value); }} disabled={saving}>
            <option value="">— Sin asignar —</option>
            {technicians.map(t => (
              <option key={t.Id} value={t.Id}>{t.FullName} ({t.Role})</option>
            ))}
          </select>
          {technician && <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><User className="w-3 h-3" />Actual: {technician.FullName}</p>}
        </div>
      )}
      {!isAdmin && detail.AssignedToName && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Técnico asignado</p>
          <p className="text-sm text-gray-700 flex items-center gap-1.5"><User className="w-4 h-4 text-gray-400" />{detail.AssignedToName}</p>
        </div>
      )}

      {nexts.includes('Resuelto') && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Mensaje de resolución *</p>
          <textarea className="input-field resize-none" rows={3} maxLength={2000}
            placeholder="Describe la solución aplicada al cliente..."
            value={resolveMsg} onChange={e => onResolveMsgChange(e.target.value)} />
          <p className="text-xs text-gray-400 text-right">{resolveMsg.length}/2000</p>
        </div>
      )}

      {warnMsg && (
        <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
          <p className="text-sm text-yellow-800">{warnMsg}</p>
        </div>
      )}

      {errMsg && <p className="text-sm text-red-600 flex items-center gap-1.5"><AlertCircle className="w-4 h-4 shrink-0" />{errMsg}</p>}

      {nexts.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
          {nexts.map(ns => (
            <button key={ns}
              onClick={() => ns === 'Cerrado' ? onCloseTicket() : onStatus(ns)}
              disabled={saving}
              className={ns === 'Cerrado' ? 'btn-danger' : 'btn-primary'}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {STATUS_LABELS[ns] ?? ns}
            </button>
          ))}
        </div>
      )}

      {detail.Status === 'Cerrado' && (
        <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-100">
          <Lock className="w-4 h-4 text-gray-400" />
          <p className="text-sm text-gray-500">Ticket cerrado. Solo lectura.</p>
        </div>
      )}
    </>
  );
}
