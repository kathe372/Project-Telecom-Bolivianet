import { useEffect, useState } from 'react';
import { Loader2, X, Star } from 'lucide-react';
import { assignTechnicians } from '@/services/installationService';
import { userService } from '@/services/userService';
import type { UserSystemDto } from '@/types/auth.types';


interface Props {
  instalacionId: string;
  instalacionLabel: string;
  onClose: () => void;
  onDone: () => void;
}

export default function AssignTechniciansModal({ instalacionId, instalacionLabel, onClose, onDone }: Props) {
  const [tecnicos, setTecnicos]     = useState<UserSystemDto[]>([]);
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [leadId, setLeadId]         = useState<string>('');
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');

  useEffect(() => {
    userService.getAll(1, 100, 'Tecnico')
      .then((r) => setTecnicos(r.Items))
      .catch(() => setError('No se pudo cargar la lista de técnicos.'))
      .finally(() => setLoading(false));
  }, []);

  const toggleTechnician = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (leadId === id) setLeadId('');
      } else {
        next.add(id);
        if (!leadId) setLeadId(id);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selected.size === 0) { setError('Selecciona al menos un técnico.'); return; }
    if (!leadId)             { setError('Elige un técnico líder.'); return; }
    setSaving(true);
    setError('');
    try {
      await assignTechnicians(instalacionId, Array.from(selected), leadId);
      onDone();
    } catch {
      setError('Error al asignar los técnicos. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Asignar técnicos</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-500 mb-4">{instalacionLabel}</p>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
            {tecnicos.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No hay técnicos disponibles.</p>
            )}
            {tecnicos.map((tec) => {
              const isSelected = selected.has(tec.Id);
              const isLead     = leadId === tec.Id;
              return (
                <div
                  key={tec.Id}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                    isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => toggleTechnician(tec.Id)}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      readOnly
                      checked={isSelected}
                      className="accent-blue-600"
                    />
                    <span className="text-sm text-gray-800">{tec.FullName}</span>
                  </div>
                  {isSelected && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setLeadId(tec.Id); }}
                      title="Marcar como líder"
                      className={`p-1 rounded transition-colors ${isLead ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'}`}
                    >
                      <Star className="w-4 h-4" fill={isLead ? 'currentColor' : 'none'} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {selected.size > 0 && (
          <p className="text-xs text-gray-500 mb-3">
            {selected.size} técnico{selected.size > 1 ? 's' : ''} seleccionado{selected.size > 1 ? 's' : ''}.
            {leadId && ` Líder: ${tecnicos.find((t) => t.Id === leadId)?.FullName ?? leadId}`}
          </p>
        )}

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || loading}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            Asignar
          </button>
        </div>
      </div>
    </div>
  );
}
