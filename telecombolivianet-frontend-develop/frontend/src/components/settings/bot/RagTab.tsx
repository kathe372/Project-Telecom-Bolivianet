import type { RefObject } from 'react';
import { FileText, Loader2, Trash2, Upload } from 'lucide-react';
import type { RagDocumentDto } from '@/services/chatbotService';

export function RagTab({
  docs, loading, uploading, title,
  onTitleChange, onFileChange, onDelete, inputRef,
}: {
  docs: RagDocumentDto[];
  loading: boolean;
  uploading: boolean;
  title: string;
  onTitleChange: (v: string) => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDelete: (id: string, fileName: string) => void;
  inputRef: RefObject<HTMLInputElement>;
}) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600">
        Documentos que entrena al bot con información específica de la empresa (planes, precios, políticas, etc.).
        El bot usa estos documentos para responder preguntas con mayor precisión.
      </p>

      <div className="p-4 border border-gray-200 rounded-lg bg-gray-50 space-y-3">
        <p className="text-sm font-medium text-gray-700">
          Subir nuevo documento
        </p>
        <div>
          <input
            type="text"
            placeholder="Título del documento (obligatorio)"
            value={title}
            onChange={e => onTitleChange(e.target.value)}
            className="input-field text-sm"
            disabled={uploading}
          />
          <p className="text-xs text-gray-400 mt-0.5">Requerido para indexar el documento</p>
        </div>
        <div className="flex items-center gap-3">
          <label className={`cursor-pointer inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg text-white transition-colors ${
            uploading ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'
          }`}>
            {uploading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Upload className="w-4 h-4" />}
            Seleccionar archivo
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.txt,.md,.docx"
              className="hidden"
              disabled={uploading}
              onChange={onFileChange}
            />
          </label>
          <span className="text-xs text-gray-400">PDF, TXT, MD, DOCX — máx. 20 MB</span>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
        </div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-gray-200 rounded-lg text-gray-400 gap-2">
          <FileText className="w-10 h-10" />
          <p className="text-sm">No hay documentos cargados.</p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Título / Archivo</th>
                <th className="px-4 py-2.5 text-right font-medium">Chunks</th>
                <th className="px-4 py-2.5 text-right font-medium">Tamaño</th>
                <th className="px-4 py-2.5 text-right font-medium">Fecha</th>
                <th className="px-4 py-2.5 text-center font-medium w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {docs.map(doc => (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800 truncate max-w-xs">{doc.title || doc.fileName}</p>
                    {doc.title && (
                      <p className="text-xs text-gray-400 truncate max-w-xs">{doc.fileName}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">{doc.chunkCount}</td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {doc.fileSize ? `${(doc.fileSize / 1024).toFixed(1)} KB` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500 whitespace-nowrap">
                    {new Date(doc.createdAt).toLocaleDateString('es-BO')}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => onDelete(doc.id, doc.fileName)}
                      className="text-gray-400 hover:text-red-600 transition-colors"
                      title="Eliminar documento"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
