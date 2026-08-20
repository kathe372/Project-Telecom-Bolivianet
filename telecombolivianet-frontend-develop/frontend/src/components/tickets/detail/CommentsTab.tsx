import { Loader2, AlertCircle, Save, ClipboardList } from 'lucide-react';
import type { TicketDetailDto, CommentType, CannedResponseDto } from '@/types/ticket.types';
import { commentTypeBadge } from '../ticketHelpers';

export function CommentsTab({
  detail, commentType, onCommentTypeChange, commentBody, onCommentBodyChange,
  cannedResponses, showCanned, onToggleCanned, onSelectCanned, onAddComment, saving, errMsg,
}: {
  detail: TicketDetailDto;
  commentType: CommentType;
  onCommentTypeChange: (t: CommentType) => void;
  commentBody: string;
  onCommentBodyChange: (v: string) => void;
  cannedResponses: CannedResponseDto[];
  showCanned: boolean;
  onToggleCanned: () => void;
  onSelectCanned: (body: string) => void;
  onAddComment: () => void;
  saving: boolean;
  errMsg: string;
}) {
  return (
    <>
      {detail.Comments.length === 0
        ? <p className="text-sm text-gray-400 text-center py-8">Sin notas aún.</p>
        : (
          <div className="space-y-3">
            {detail.Comments.map(c => (
              <div key={c.Id} className={`rounded-lg p-3 border text-sm
                ${c.Type === 'RespuestaCliente' ? 'bg-blue-50 border-blue-100' :
                  c.Type === 'CausaRaiz' ? 'bg-purple-50 border-purple-100' :
                  'bg-gray-50 border-gray-100'}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  {commentTypeBadge(c.Type)}
                  <span className="text-xs text-gray-500">{c.AuthorName} · {new Date(c.CreatedAt).toLocaleString('es-BO')}</span>
                </div>
                <p className="text-gray-700 whitespace-pre-wrap">{c.Body}</p>
              </div>
            ))}
          </div>
        )}

      {detail.Status !== 'Cerrado' && (
        <div className="border-t border-gray-100 pt-4 space-y-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Agregar nota / respuesta</p>
          <div className="flex gap-2">
            {(['NotaInterna', 'RespuestaCliente', 'CausaRaiz'] as CommentType[]).map(t => (
              <button key={t} onClick={() => onCommentTypeChange(t)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors
                  ${commentType === t ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {t === 'NotaInterna' ? 'Nota interna' : t === 'RespuestaCliente' ? 'Respuesta cliente' : 'Causa raíz'}
              </button>
            ))}
          </div>
          {cannedResponses.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={onToggleCanned}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-purple-200 text-purple-700 hover:bg-purple-50"
              >
                <ClipboardList className="w-3.5 h-3.5" /> Usar plantilla
              </button>
              {showCanned && (
                <div className="absolute z-10 mt-1 w-80 bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                  {cannedResponses.map(cr => (
                    <button
                      key={cr.Id}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-b-0"
                      onClick={() => onSelectCanned(cr.Body)}
                    >
                      <p className="text-sm font-medium text-gray-800">{cr.Title}</p>
                      {cr.Category && <p className="text-xs text-gray-400">{cr.Category}</p>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <textarea className="input-field resize-none" rows={4} maxLength={4000}
            placeholder={commentType === 'RespuestaCliente'
              ? 'Escribe la respuesta visible para el cliente...'
              : commentType === 'CausaRaiz'
              ? 'Documenta la causa raíz del problema...'
              : 'Nota interna del equipo de soporte...'}
            value={commentBody} onChange={e => onCommentBodyChange(e.target.value)} />
          <div className="flex justify-between items-center">
            <p className="text-xs text-gray-400">{commentBody.length}/4000</p>
            <button className="btn-primary" onClick={onAddComment} disabled={saving || !commentBody.trim()}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar
            </button>
          </div>
          {errMsg && <p className="text-sm text-red-600 flex items-center gap-1.5"><AlertCircle className="w-4 h-4" />{errMsg}</p>}
        </div>
      )}
    </>
  );
}
