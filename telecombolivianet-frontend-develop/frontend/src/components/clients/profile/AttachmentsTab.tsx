import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, CheckCircle2, Download, Loader2, Paperclip, Trash2, Upload,
} from 'lucide-react';
import {
  getAttachments, uploadAttachment, deleteAttachment, downloadAttachment,
  TIPO_DOC_LABELS, TIPO_DOC_ICONS,
  type ClientAttachmentDto,
} from '@/services/clientService';
import { extractApiError } from '@/utils/apiError';
import ConfirmDialog, { type ConfirmState, CONFIRM_CLOSED } from '@/components/shared/ConfirmDialog';

export function AttachmentsTab({ clientId, isAdmin }: { clientId: string; isAdmin: boolean }) {
  const [attachments,    setAttachments]    = useState<ClientAttachmentDto[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [uploading,      setUploading]      = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [success,        setSuccess]        = useState<string | null>(null);
  const [confirmDialog,  setConfirmDialog]  = useState<ConfirmState>(CONFIRM_CLOSED);
  const [confirmRunning, setConfirmRunning] = useState(false);
  const closeConfirm = () => { setConfirmDialog(CONFIRM_CLOSED); setConfirmRunning(false); };
  const [tipoDoc, setTipoDoc]         = useState('Otro');
  const [descripcion, setDescripcion] = useState('');
  const fileRef                       = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setAttachments(await getAttachments(clientId));
    } catch { setError('Error al cargar adjuntos.'); }
    finally { setLoading(false); }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) { setError('El archivo no puede superar 5 MB.'); return; }
    if (!ALLOWED_TYPES.includes(file.type)) { setError('Tipo de archivo no permitido. Use JPG, PNG, WEBP o PDF.'); return; }
    setUploading(true); setError(null);
    try {
      await uploadAttachment(clientId, file, tipoDoc, descripcion || undefined);
      setSuccess('Archivo subido correctamente.');
      setDescripcion('');
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (err: unknown) {
      setError(extractApiError(err, 'Error al subir el archivo.'));
    } finally { setUploading(false); }
  };

  const handleDelete = (att: ClientAttachmentDto) => {
    setConfirmDialog({
      open: true, variant: 'danger',
      title: 'Eliminar documento',
      message: `¿Eliminar "${att.FileName}"? Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      onConfirm: async () => {
        setConfirmRunning(true);
        try {
          await deleteAttachment(clientId, att.Id);
          setAttachments(prev => prev.filter(a => a.Id !== att.Id));
          setSuccess('Adjunto eliminado.');
          closeConfirm();
        } catch {
          setError('Error al eliminar.');
          closeConfirm();
        }
      },
    });
  };

  const fmtSize = (bytes: number) =>
    bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

  if (loading) return <div className="card p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-indigo-600" /></div>;

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto">✕</button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          <CheckCircle2 className="w-4 h-4" /> {success}
        </div>
      )}

      <div className="card p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-indigo-600" /> Subir documento
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Tipo de documento</label>
            <select
              value={tipoDoc}
              onChange={e => setTipoDoc(e.target.value)}
              className="input-field text-sm"
            >
              {Object.entries(TIPO_DOC_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{TIPO_DOC_ICONS[k]} {v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Descripción (opcional)</label>
            <input
              type="text"
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              placeholder="Ej: CI vigente 2026"
              className="input-field text-sm"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
            uploading ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white'
          }`}>
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Subiendo...' : 'Seleccionar archivo'}
            <input
              ref={fileRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx"
              className="hidden"
              disabled={uploading}
              onChange={handleUpload}
            />
          </label>
          <span className="text-xs text-gray-400">JPG, PNG, WebP, PDF, DOCX — máx 10 MB</span>
        </div>
      </div>

      {attachments.length === 0 ? (
        <div className="card p-8 text-center text-gray-400 text-sm">
          No hay documentos adjuntos para este cliente.
        </div>
      ) : (
        <div className="space-y-2">
          {attachments.map(att => (
            <div key={att.Id} className="card p-3 flex items-center gap-3">
              <span className="text-2xl shrink-0">{TIPO_DOC_ICONS[att.TipoDoc] ?? '📎'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{att.FileName}</p>
                <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                  <span>{TIPO_DOC_LABELS[att.TipoDoc] ?? att.TipoDoc}</span>
                  {att.Descripcion && <><span>·</span><span className="truncate">{att.Descripcion}</span></>}
                  <span>·</span><span>{fmtSize(att.FileSizeBytes)}</span>
                  <span>·</span><span>{new Date(att.SubidoAt).toLocaleDateString('es-BO')}</span>
                  <span>·</span><span>{att.SubidoPorNombre}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => downloadAttachment(clientId, att.Id)}
                  className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                  title="Descargar"
                >
                  <Download className="w-4 h-4" />
                </button>
                {isAdmin && (
                  <button
                    onClick={() => handleDelete(att)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog state={confirmDialog} onClose={closeConfirm} running={confirmRunning} />
    </div>
  );
}
