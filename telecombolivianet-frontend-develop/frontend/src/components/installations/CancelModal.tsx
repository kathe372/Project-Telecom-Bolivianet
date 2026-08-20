import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  cancelInstallation, type InstallationListItemDto,
} from '@/services/installationService';

export function CancelModal({
  instalacion, onClose, onDone,
}: {
  instalacion: InstallationListItemDto;
  onClose: () => void;
  onDone: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!motivo.trim()) { setError('El motivo es obligatorio.'); return; }
    setLoading(true);
    try {
      await cancelInstallation(instalacion.Id, motivo);
      onDone();
    } catch {
      setError('Error al cancelar. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h3 className="text-base font-medium text-gray-900 mb-1">Cancelar instalación</h3>
        <p className="text-sm text-gray-500 mb-4">
          {instalacion.ClienteNombre} — {instalacion.Fecha} {instalacion.HoraInicio}
        </p>
        <label className="block text-sm font-medium text-gray-700 mb-1">Motivo</label>
        <textarea
          className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-300"
          rows={3}
          placeholder="Describe el motivo de cancelación..."
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <Loader2 className="w-3 h-3 animate-spin" />}
            Confirmar cancelación
          </button>
        </div>
      </div>
    </div>
  );
}
