import { useEffect, useState } from 'react';
import { Loader2, Camera, X as XIcon } from 'lucide-react';
import {
  completeInstallation, uploadInstallationPhoto,
  type InstallationListItemDto,
} from '@/services/installationService';
import { coverageService } from '@/services/coverageService';
import type { DistributionBox } from '@/types/coverage';

// Checklist fijo v1 (F5 nivel comercial): prueba de trabajo estándar.
const CHECKLIST_ITEMS: { key: string; label: string }[] = [
  { key: 'onu_encendida',      label: 'ONU instalada y encendida' },
  { key: 'senal_ok',           label: 'Potencia de señal verificada' },
  { key: 'velocidad_ok',       label: 'Velocidad del plan verificada' },
  { key: 'cliente_conforme',   label: 'Cliente conforme con la instalación' },
];

const MAX_FOTOS = 3;

export function CompleteModal({
  instalacion, onClose, onDone,
}: {
  instalacion: InstallationListItemDto;
  onClose: () => void;
  onDone: () => void;
}) {
  const [notas, setNotas] = useState('');
  const [boxId, setBoxId] = useState('');
  const [boxes, setBoxes] = useState<DistributionBox[]>([]);
  const [onuSerial, setOnuSerial] = useState('');
  const [metrosDrop, setMetrosDrop] = useState('');
  const [checklist, setChecklist] = useState<Record<string, boolean>>(
    Object.fromEntries(CHECKLIST_ITEMS.map(i => [i.key, false])));
  const [fotos, setFotos] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    coverageService.getAllBoxes()
      .then(all => {
        // La caja reservada al agendar se incluye aunque no tenga puertos
        // "libres" (nuestra propia reserva la descuenta) y se preselecciona.
        const selectable = all.filter(b =>
          (b.estado === 'Activo' && b.puertosLibres > 0) ||
          b.codigo === instalacion.BoxCodigo);
        setBoxes(selectable);
        const reservada = selectable.find(b => b.codigo === instalacion.BoxCodigo);
        if (reservada) setBoxId(reservada.id);
      })
      .catch(() => {});
  }, [instalacion.BoxCodigo]);

  const addFotos = (files: FileList | null) => {
    if (!files) return;
    setFotos(prev => [...prev, ...Array.from(files)].slice(0, MAX_FOTOS));
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      const fotosUrls: string[] = [];
      for (const foto of fotos) {
        fotosUrls.push(await uploadInstallationPhoto(instalacion.Id, foto));
      }
      await completeInstallation(
        instalacion.Id, notas || undefined, boxId || undefined,
        {
          equipoOnuSerial: onuSerial || undefined,
          metrosDrop:      metrosDrop ? Number(metrosDrop) : undefined,
          checklist,
          fotosUrls:       fotosUrls.length > 0 ? fotosUrls : undefined,
        });
      onDone();
    } catch {
      setError('Error al completar la instalación. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-base font-medium text-gray-900 mb-1">Completar instalación</h3>
        <p className="text-sm text-gray-500 mb-4">
          {instalacion.ClienteNombre} — {instalacion.Fecha} {instalacion.HoraInicio}
        </p>

        <label className="block text-sm font-medium text-gray-700 mb-1">
          Checklist de cierre
        </label>
        <div className="space-y-1 mb-3">
          {CHECKLIST_ITEMS.map(item => (
            <label key={item.key} className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                className="rounded"
                checked={checklist[item.key]}
                onChange={e => setChecklist(c => ({ ...c, [item.key]: e.target.checked }))}
              />
              {item.label}
            </label>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Serial ONU</label>
            <input
              type="text"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
              placeholder="HWTC12345678"
              value={onuSerial}
              onChange={e => setOnuSerial(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Metros de drop</label>
            <input
              type="number" min="0"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
              placeholder="50"
              value={metrosDrop}
              onChange={e => setMetrosDrop(e.target.value)}
            />
          </div>
        </div>

        <label className="block text-sm font-medium text-gray-700 mb-1">
          Fotos de la instalación ({fotos.length}/{MAX_FOTOS})
        </label>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {fotos.map((f, idx) => (
            <span key={idx}
              className="inline-flex items-center gap-1 bg-gray-100 rounded px-2 py-1 text-xs text-gray-600">
              {f.name.length > 18 ? `${f.name.slice(0, 15)}…` : f.name}
              <button onClick={() => setFotos(prev => prev.filter((_, i) => i !== idx))}
                aria-label="Quitar foto">
                <XIcon className="w-3 h-3 text-gray-400 hover:text-red-500" />
              </button>
            </span>
          ))}
          {fotos.length < MAX_FOTOS && (
            <label className="inline-flex items-center gap-1 text-xs text-blue-600 cursor-pointer hover:underline">
              <Camera className="w-4 h-4" /> Agregar foto
              <input
                type="file" accept="image/jpeg,image/png,image/webp" multiple hidden
                onChange={e => { addFotos(e.target.files); e.target.value = ''; }}
              />
            </label>
          )}
        </div>

        <label className="block text-sm font-medium text-gray-700 mb-1">
          Caja NAP asignada (opcional)
        </label>
        <select
          className="w-full border rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-green-300"
          value={boxId}
          onChange={(e) => setBoxId(e.target.value)}
        >
          <option value="">— Sin caja / asignar después —</option>
          {boxes.map(b => (
            <option key={b.id} value={b.id}>
              {b.codigo === instalacion.BoxCodigo
                ? `${b.codigo} · ${b.zoneName} · ⭐ reservada al agendar`
                : `${b.codigo} · ${b.zoneName} · ${b.puertosLibres} puerto(s) libre(s)`}
            </option>
          ))}
        </select>

        <label className="block text-sm font-medium text-gray-700 mb-1">
          Notas del técnico (opcional)
        </label>
        <textarea
          className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-300"
          rows={3}
          placeholder="Observaciones, equipos instalados, etc."
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
        />
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <Loader2 className="w-3 h-3 animate-spin" />}
            Marcar como completada
          </button>
        </div>
      </div>
    </div>
  );
}
