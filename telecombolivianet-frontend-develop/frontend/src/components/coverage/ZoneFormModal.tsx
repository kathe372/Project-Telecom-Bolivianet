import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, Loader2 } from 'lucide-react';
import type { CoverageZone, CreateCoverageZoneRequest, UpdateCoverageZoneRequest } from '@/types/coverage';

const schema = z.object({
  nombre:                 z.string().min(2, 'Obligatorio').max(200),
  tecnologia:             z.enum(['GPON', 'WIMAX', 'CABLE', 'MIXTA']),
  velocidadMaxMbps:       z.coerce.number().min(1, 'Debe ser mayor a 0'),
  estado:                 z.enum(['Activa', 'EnExpansion', 'Planificada', 'Inactiva']),
  fechaExpansionEstimada: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open:          boolean;
  zone?:         CoverageZone | null;
  initialGeoJson?: string | null;
  saving:        boolean;
  onSave:        (data: CreateCoverageZoneRequest | UpdateCoverageZoneRequest) => void;
  onClose:       () => void;
}

export default function ZoneFormModal({
  open, zone, initialGeoJson, saving, onSave, onClose,
}: Props) {
  const isEdit = !!zone;

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      tecnologia:       'GPON',
      velocidadMaxMbps: 100,
      estado:           'Planificada',
    },
  });

  const estado = watch('estado');
  const showExpansionDate = estado === 'EnExpansion' || estado === 'Planificada';

  useEffect(() => {
    if (open) {
      reset(zone
        ? {
            nombre:                 zone.nombre,
            tecnologia:             zone.tecnologia as FormData['tecnologia'],
            velocidadMaxMbps:       zone.velocidadMaxMbps,
            estado:                 zone.estado as FormData['estado'],
            fechaExpansionEstimada: zone.fechaExpansionEstimada ?? '',
          }
        : { tecnologia: 'GPON', velocidadMaxMbps: 100, estado: 'Planificada' });
    }
  }, [open, zone, reset]);

  if (!open) return null;

  const onSubmit = (data: FormData) => {
    const payload = {
      nombre:                 data.nombre,
      tecnologia:             data.tecnologia,
      velocidadMaxMbps:       data.velocidadMaxMbps,
      estado:                 data.estado,
      fechaExpansionEstimada: showExpansionDate ? (data.fechaExpansionEstimada || undefined) : undefined,
      geoJson:                (isEdit ? (initialGeoJson ?? zone?.geoJson) : initialGeoJson) ?? '',
    };
    onSave(payload);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">
            {isEdit ? 'Editar zona' : 'Nueva zona de cobertura'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="px-6 py-4 space-y-4">

          {!isEdit && !initialGeoJson && (
            <p className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
              Dibuja primero el polígono en el mapa, luego completa los datos.
            </p>
          )}

          <div>
            <label className="label">Nombre *</label>
            <input type="text" className={`input-field ${errors.nombre ? 'input-error' : ''}`}
              placeholder="Zona Centro" {...register('nombre')} />
            {errors.nombre && <p className="error-msg">{errors.nombre.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Tecnología *</label>
              <select className="input-field" {...register('tecnologia')}>
                <option>GPON</option>
                <option>WIMAX</option>
                <option>CABLE</option>
                <option>MIXTA</option>
              </select>
            </div>
            <div>
              <label className="label">Velocidad máx. (Mbps) *</label>
              <input type="number" className={`input-field ${errors.velocidadMaxMbps ? 'input-error' : ''}`}
                min={1} {...register('velocidadMaxMbps')} />
              {errors.velocidadMaxMbps && <p className="error-msg">{errors.velocidadMaxMbps.message}</p>}
            </div>
          </div>

          <div>
            <label className="label">Estado *</label>
            <select className="input-field" {...register('estado')}>
              <option value="Activa">Activa</option>
              <option value="EnExpansion">En expansión</option>
              <option value="Planificada">Planificada</option>
              <option value="Inactiva">Inactiva</option>
            </select>
          </div>

          {showExpansionDate && (
            <div>
              <label className="label">Fecha estimada de expansión</label>
              <input type="date" className="input-field" {...register('fechaExpansionEstimada')} />
            </div>
          )}

          {initialGeoJson && (
            <p className="text-[11px] text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
              ✓ Polígono capturado del mapa
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || (!isEdit && !initialGeoJson)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              {isEdit ? 'Guardar cambios' : 'Crear zona'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
