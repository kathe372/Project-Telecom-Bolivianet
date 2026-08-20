import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  assignInstallationBox, type InstallationListItemDto,
} from '@/services/installationService';
import { coverageService } from '@/services/coverageService';
import type { DistributionBox } from '@/types/coverage';

export function AssignBoxModal({
  instalacion, onClose, onDone,
}: {
  instalacion: InstallationListItemDto;
  onClose: () => void;
  onDone: () => void;
}) {
  const [boxId, setBoxId] = useState('');
  const [boxes, setBoxes] = useState<DistributionBox[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    coverageService.getAllBoxes()
      .then(all => setBoxes(all.filter(b => b.estado === 'Activo' && b.puertosLibres > 0)))
      .catch(() => {});
  }, []);

  const handleSubmit = async () => {
    if (!boxId) return;
    setLoading(true);
    setError('');
    try {
      await assignInstallationBox(instalacion.Id, boxId);
      onDone();
    } catch {
      setError('Error al asignar la caja. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h3 className="text-base font-medium text-gray-900 mb-1">
          {instalacion.BoxCodigo ? 'Reasignar caja NAP' : 'Asignar caja NAP'}
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          {instalacion.ClienteNombre} ({instalacion.ClienteTbn})
          {instalacion.BoxCodigo && <> — caja actual: <b>{instalacion.BoxCodigo}</b></>}
        </p>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Caja NAP con puertos libres
        </label>
        <select
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          value={boxId}
          onChange={(e) => setBoxId(e.target.value)}
        >
          <option value="">— Seleccionar caja —</option>
          {boxes.map(b => (
            <option key={b.id} value={b.id}>
              {b.codigo} · {b.zoneName} · {b.puertosLibres} puerto(s) libre(s)
            </option>
          ))}
        </select>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !boxId}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <Loader2 className="w-3 h-3 animate-spin" />}
            Asignar caja
          </button>
        </div>
      </div>
    </div>
  );
}
