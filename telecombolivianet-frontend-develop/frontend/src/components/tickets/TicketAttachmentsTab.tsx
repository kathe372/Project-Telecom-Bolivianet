import { useState, useEffect, useRef } from 'react';
import {
  Paperclip, Upload, Trash2, Download, Loader2,
  AlertCircle, FileText, Image, File,
} from 'lucide-react';
import { ticketService } from '@/services/ticketService';
import type { TicketAttachmentDto } from '@/types/ticket.types';
import { extractApiError } from '@/utils/apiError';


const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES      = 10;

function formatBytes(bytes: number): string {
  if (bytes < 1024)         return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ contentType }: { contentType: string }) {
  if (contentType.startsWith('image/'))
    return <Image className="w-5 h-5 text-blue-400 shrink-0" />;
  if (contentType === 'application/pdf')
    return <FileText className="w-5 h-5 text-red-400 shrink-0" />;
  return <File className="w-5 h-5 text-gray-400 shrink-0" />;
}

interface Props {
  ticketId:   string;
  isReadOnly: boolean;
}

export function TicketAttachmentsTab({ ticketId, isReadOnly }: Props) {
  const [attachments, setAttachments] = useState<TicketAttachmentDto[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [loadErr,     setLoadErr]     = useState('');
  const [uploading,   setUploading]   = useState(false);
  const [uploadErr,   setUploadErr]   = useState('');
  const [deletingId,  setDeletingId]  = useState<string | null>(null);
  const [dragOver,    setDragOver]    = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true); setLoadErr('');
    try {
      const data = await ticketService.getAttachments(ticketId);
      setAttachments(data);
    } catch {
      setLoadErr('No se pudieron cargar los adjuntos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [ticketId]);

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type))
      return `Tipo no permitido: ${file.type}. Usa JPG, PNG, WebP, PDF o Word.`;
    if (file.size > MAX_FILE_BYTES)
      return `El archivo "${file.name}" supera el límite de 10 MB.`;
    if (attachments.length >= MAX_FILES)
      return `Límite de ${MAX_FILES} adjuntos por ticket alcanzado.`;
    return null;
  };

  const handleUpload = async (file: File) => {
    const err = validateFile(file);
    if (err) { setUploadErr(err); return; }
    setUploading(true); setUploadErr('');
    try {
      const newAtt = await ticketService.uploadAttachment(ticketId, file);
      setAttachments(prev => [newAtt, ...prev]);
    } catch (e: unknown) {
      setUploadErr(extractApiError(e, 'Error al subir el archivo.'));
    } finally {
      setUploading(false);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  const handleDelete = async (att: TicketAttachmentDto) => {
    if (!confirm(`¿Eliminar "${att.FileName}"?`)) return;
    setDeletingId(att.Id);
    try {
      await ticketService.deleteAttachment(ticketId, att.Id);
      setAttachments(prev => prev.filter(a => a.Id !== att.Id));
    } catch (e: unknown) {
      setUploadErr(extractApiError(e, 'Error al eliminar el adjunto.'));
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {loadErr && (
        <p className="text-sm text-red-600 flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4" /> {loadErr}
        </p>
      )}

      {}
      {attachments.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">Sin adjuntos.</p>
      ) : (
        <div className="space-y-2">
          {attachments.map(att => (
            <div
              key={att.Id}
              className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5"
            >
              <FileIcon contentType={att.ContentType} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{att.FileName}</p>
                <p className="text-xs text-gray-400">
                  {formatBytes(att.FileSizeBytes)} · {att.SubidoPorNombre} ·{' '}
                  {new Date(att.SubidoAt).toLocaleDateString('es-BO')}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => ticketService.downloadAttachment(ticketId, att.Id)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  title="Descargar"
                >
                  <Download className="w-4 h-4" />
                </button>
                {!isReadOnly && (
                  <button
                    onClick={() => handleDelete(att)}
                    disabled={deletingId === att.Id}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                    title="Eliminar"
                  >
                    {deletingId === att.Id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Trash2 className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {}
      {!isReadOnly && (
        <div className="border-t border-gray-100 pt-4">
          {uploadErr && (
            <p className="text-sm text-red-600 flex items-center gap-1.5 mb-3">
              <AlertCircle className="w-4 h-4 shrink-0" /> {uploadErr}
            </p>
          )}

          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer
              ${dragOver
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
            onClick={() => !uploading && inputRef.current?.click()}
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-2 text-blue-600">
                <Loader2 className="w-6 h-6 animate-spin" />
                <p className="text-sm font-medium">Subiendo archivo...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-gray-400">
                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                  {dragOver
                    ? <Upload className="w-5 h-5 text-blue-500" />
                    : <Paperclip className="w-5 h-5" />}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">
                    Arrastra un archivo o{' '}
                    <span className="text-blue-600 underline">selecciona</span>
                  </p>
                  <p className="text-xs mt-0.5">
                    JPG, PNG, WebP, PDF, Word · Máx. 10 MB
                  </p>
                </div>
              </div>
            )}
          </div>

          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={ALLOWED_TYPES.join(',')}
            onChange={handleFileInput}
          />

          <p className="text-xs text-gray-400 mt-2 text-right">
            {attachments.length}/{MAX_FILES} adjuntos
          </p>
        </div>
      )}
    </div>
  );
}
