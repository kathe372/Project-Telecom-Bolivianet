import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, Loader2 } from 'lucide-react';
import type {
  CoverageZone, DistributionBox,
  CreateDistributionBoxRequest, UpdateDistributionBoxRequest,
} from '@/types/coverage';

const schema = z.object({
  codigo:                 z.string().min(1, 'Obligatorio').max(50),
  direccionReferencia:    z.string().min(1, 'Obligatorio').max(300),
  zoneId:                 z.string().uuid('Selecciona una zona'),
  puertosTotal:           z.coerce.number().min(1, 'Mínimo 1'),
  puertosOcupados:        z.coerce.number().min(0).optional(),
  distanciaMaxCableMetros: z.coerce.number().min(1).optional().or(z.literal('')),
  estado:                 z.enum(['Activo', 'Saturado', 'Mantenimiento']).optional(),
}).refine(
  d => !d.puertosOcupados || d.puertosOcupados <= d.puertosTotal,
  { message: 'PuertosOcupados no puede superar PuertosTotal', path: ['puertosOcupados'] },
);

type FormData = z.infer<typeof schema>;

interface Props {
  open:          boolean;
  box?:          DistributionBox | null;
  zones:         CoverageZone[];
  preselectedZoneId?: string;
  pendingLat?:   number | null;
  pendingLng?:   number | null;
  saving:        boolean;
  onSave:        (data: CreateDistributionBoxRequest | UpdateDistributionBoxRequest) => void;
  onClose:       () => void;
}

export default function BoxFormModal({
  open, box, zones, preselectedZoneId, pendingLat, pendingLng, saving, onSave, onClose,
}: Props) {
  const isEdit = !!box;

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { puertosTotal: 8, puertosOcupados: 0, estado: 'Activo' },
  });

  useEffect(() => {
    if (open) {
      reset(box
        ? {
            codigo:                  box.codigo,
            direccionReferencia:     box.direccionReferencia,
            zoneId:                  box.zoneId,
            puertosTotal:            box.puertosTotal,
            puertosOcupados:         box.puertosOcupados,
            distanciaMaxCableMetros: box.distanciaMaxCableMetros ?? '',
            estado:                  box.estado,
          }
        : {
            zoneId:          preselectedZoneId ?? '',
            puertosTotal:    8,
            puertosOcupados: 0,
            estado:          'Activo',
          });
    }
  }, [open, box, preselectedZoneId, reset]);

  if (!open) return null;

  const onSubmit = (data: FormData) => {
    const dist = data.distanciaMaxCableMetros
      ? Number(data.distanciaMaxCableMetros) : undefined;

    if (isEdit) {
      onSave({
        codigo:                  data.codigo,
        direccionReferencia:     data.direccionReferencia,
        puertosTotal:            data.puertosTotal,
        puertosOcupados:         data.puertosOcupados ?? 0,
        distanciaMaxCableMetros: dist,
        estado:                  data.estado ?? 'Activo',
      } satisfies UpdateDistributionBoxRequest);
    } else {
      onSave({
        codigo:                  data.codigo,
        direccionReferencia:     data.direccionReferencia,
        zoneId:                  data.zoneId,
        lat:                     pendingLat!,
        lng:                     pendingLng!,
        puertosTotal:            data.puertosTotal,
        distanciaMaxCableMetros: dist,
      } satisfies CreateDistributionBoxRequest);
    }
  };

  const hasPendingLocation = pendingLat != null && pendingLng != null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">
            {isEdit ? 'Editar caja NAP' : 'Nueva caja NAP'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="px-6 py-4 space-y-4">

          {!isEdit && !hasPendingLocation && (
            <p className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
              Coloca primero el pin en el mapa, luego completa los datos.
            </p>
          )}

          {!isEdit && hasPendingLocation && (
            <p className="text-[11px] text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
              ✓ Ubicación capturada: {pendingLat!.toFixed(6)}, {pendingLng!.toFixed(6)}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Código *</label>
              <input type="text" className={`input-field ${errors.codigo ? 'input-error' : ''}`}
                placeholder="NAP-001" {...register('codigo')} />
              {errors.codigo && <p className="error-msg">{errors.codigo.message}</p>}
            </div>
            <div>
              <label className="label">Puertos totales *</label>
              <input type="number" className={`input-field ${errors.puertosTotal ? 'input-error' : ''}`}
                min={1} {...register('puertosTotal')} />
              {errors.puertosTotal && <p className="error-msg">{errors.puertosTotal.message}</p>}
            </div>
          </div>

          <div>
            <label className="label">Dirección de referencia *</label>
            <input type="text" className={`input-field ${errors.direccionReferencia ? 'input-error' : ''}`}
              placeholder="Av. Principal frente al parque" {...register('direccionReferencia')} />
            {errors.direccionReferencia && <p className="error-msg">{errors.direccionReferencia.message}</p>}
          </div>

          {!isEdit && (
            <div>
              <label className="label">Zona *</label>
              <select className={`input-field ${errors.zoneId ? 'input-error' : ''}`} {...register('zoneId')}>
                <option value="">Seleccionar zona...</option>
                {zones.filter(z => z.estado === 'Activa' || z.estado === 'EnExpansion').map(z => (
                  <option key={z.id} value={z.id}>{z.nombre}</option>
                ))}
              </select>
              {errors.zoneId && <p className="error-msg">{errors.zoneId.message}</p>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {isEdit && (
              <div>
                <label className="label">Puertos ocupados</label>
                <input type="number" className="input-field"
                  min={0} {...register('puertosOcupados')} />
                {errors.puertosOcupados && <p className="error-msg">{errors.puertosOcupados.message}</p>}
              </div>
            )}
            <div>
              <label className="label">Dist. máx. cable (m)</label>
              <input type="number" className="input-field"
                placeholder="Global (50)" min={1} {...register('distanciaMaxCableMetros')} />
            </div>
            {isEdit && (
              <div>
                <label className="label">Estado</label>
                <select className="input-field" {...register('estado')}>
                  <option value="Activo">Activo</option>
                  <option value="Saturado">Saturado</option>
                  <option value="Mantenimiento">Mantenimiento</option>
                </select>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || (!isEdit && !hasPendingLocation)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              {isEdit ? 'Guardar cambios' : 'Crear caja'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
