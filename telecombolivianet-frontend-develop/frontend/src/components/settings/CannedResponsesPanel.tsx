import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Save, X, Loader2, AlertCircle } from 'lucide-react';
import { cannedResponseService } from '@/services/cannedResponseService';
import type { CannedResponseDto } from '@/types/ticket.types';
import { extractApiError } from '@/utils/apiError';

export function CannedResponsesPanel() {
  const [items,   setItems]   = useState<CannedResponseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [editId,  setEditId]  = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const [title,    setTitle]    = useState('');
  const [body,     setBody]     = useState('');
  const [category, setCategory] = useState('');
  const [saving,   setSaving]   = useState(false);

  const load = async () => {
    try {
      setItems(await cannedResponseService.getAll(true));
    } catch { setError('Error al cargar plantillas.'); }
    finally   { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const resetForm = () => { setTitle(''); setBody(''); setCategory(''); setEditId(null); setShowNew(false); };

  const startEdit = (item: CannedResponseDto) => {
    setEditId(item.Id);
    setTitle(item.Title);
    setBody(item.Body);
    setCategory(item.Category ?? '');
    setShowNew(false);
  };

  const handleSave = async () => {
    if (!title.trim() || !body.trim()) { setError('Título y cuerpo son obligatorios.'); return; }
    setSaving(true); setError('');
    try {
      if (editId) {
        await cannedResponseService.update(editId, { Title: title, Body: body, Category: category || undefined });
      } else {
        await cannedResponseService.create({ Title: title, Body: body, Category: category || undefined });
      }
      resetForm();
      await load();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Error al guardar.'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (item: CannedResponseDto) => {
    try {
      await cannedResponseService.update(item.Id, { IsActive: !item.IsActive });
      await load();
    } catch { setError('Error al cambiar estado.'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta plantilla?')) return;
    try {
      await cannedResponseService.delete(id);
      await load();
    } catch { setError('Error al eliminar.'); }
  };

  const INPUT = "border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-300";

  if (loading) return <div className="text-sm text-gray-400">Cargando...</div>;

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-sm text-red-600 flex items-center gap-1"><AlertCircle className="w-4 h-4" />{error}</p>
      )}

      {}
      {(showNew || editId) && (
        <div className="border rounded-lg p-4 space-y-2 bg-blue-50">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Título *</label>
              <input className={INPUT} placeholder="Ej: Reinicio de router" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div className="w-36">
              <label className="block text-xs font-medium text-gray-600 mb-1">Categoría</label>
              <input className={INPUT} placeholder="Ej: Red, Equipo..." value={category} onChange={e => setCategory(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Texto *</label>
            <textarea className={`${INPUT} resize-none`} rows={4} placeholder="Texto de la respuesta..." value={body} onChange={e => setBody(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Guardar
            </button>
            <button onClick={resetForm} className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">
              <X className="w-3.5 h-3.5" /> Cancelar
            </button>
          </div>
        </div>
      )}

      {}
      {items.length === 0 && !showNew && (
        <p className="text-sm text-gray-400">Sin plantillas definidas.</p>
      )}
      {items.map(item => (
        <div key={item.Id} className={`flex items-start gap-3 border rounded-lg px-4 py-3 ${item.IsActive ? 'bg-white' : 'bg-gray-50 opacity-60'}`}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-medium text-gray-800">{item.Title}</span>
              {item.Category && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{item.Category}</span>
              )}
              {!item.IsActive && <span className="text-xs text-gray-400">(inactiva)</span>}
            </div>
            <p className="text-xs text-gray-500 line-clamp-2">{item.Body}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => startEdit(item)} title="Editar"
              className="p-1.5 text-gray-400 hover:text-blue-600 rounded">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => handleToggle(item)} title={item.IsActive ? 'Desactivar' : 'Activar'}
              className={`p-1.5 rounded text-xs ${item.IsActive ? 'text-green-600 hover:text-red-500' : 'text-gray-400 hover:text-green-600'}`}>
              {item.IsActive ? '●' : '○'}
            </button>
            <button onClick={() => handleDelete(item.Id)} title="Eliminar"
              className="p-1.5 text-gray-400 hover:text-red-500 rounded">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}

      {!showNew && !editId && (
        <button onClick={() => { setShowNew(true); resetForm(); setShowNew(true); }}
          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 px-2 py-1 rounded border border-dashed border-blue-200 hover:bg-blue-50 w-full justify-center">
          <Plus className="w-4 h-4" /> Nueva plantilla
        </button>
      )}
    </div>
  );
}
