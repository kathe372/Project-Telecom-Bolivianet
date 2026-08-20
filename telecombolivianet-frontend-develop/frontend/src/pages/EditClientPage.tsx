import { useEffect, useState, lazy, Suspense, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, AlertCircle, ChevronRight, Check, ArrowLeft, Navigation, X as XIcon } from 'lucide-react';
import { clientService, planService } from '@/services/clientService';
import type { PlanDto } from '@/types/client.types';
import { extractApiError } from '@/utils/apiError';

const GpsMiniMap = lazy(() => import('@/components/coverage/GpsMiniMap'));

const schema = z.object({
  FullName:         z.string().min(2, 'Obligatorio').max(150),
  IdentityCard:     z.string().min(1, 'Obligatorio').max(20),
  PhoneMain:        z.string().min(7, 'Obligatorio').max(20),
  PhoneSecondary:   z.string().optional(),
  Zone:             z.string().min(2, 'Obligatorio'),
  Street:           z.string().optional(),
  LocationRef:      z.string().optional(),
  GpsLatitude:      z.coerce.number().optional().or(z.literal('')),
  GpsLongitude:     z.coerce.number().optional().or(z.literal('')),
  WinboxNumber:     z.string().min(1, 'Obligatorio').max(50),
  PlanId:           z.string().uuid('Selecciona un plan'),
  HasTvCable:       z.boolean(),
  OnuSerialNumber:  z.string().optional(),
});

type FormData = z.infer<typeof schema>;

function Field({ label, error, children, full }: {
  label: string; error?: string; children: ReactNode; full?: boolean;
}) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <label className="label">{label}</label>
      {children}
      {error && <p className="error-msg">{error}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card p-6 mb-4">
      <h2 className="text-sm font-semibold text-gray-900 mb-5 pb-2 border-b border-gray-100">
        {title}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

export default function EditClientPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [plans,       setPlans]       = useState<PlanDto[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [serverError, setServerError] = useState('');
  const [tbnCode,     setTbnCode]     = useState('');

  const [gpsError,   setGpsError]   = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);

  const {
    register, handleSubmit, reset, watch, setValue,
    formState: { errors, isDirty },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const gpsLat = watch('GpsLatitude');
  const gpsLng = watch('GpsLongitude');
  const hasGps = gpsLat !== '' && gpsLat != null && gpsLng !== '' && gpsLng != null;

  const captureCurrentLocation = () => {
    setGpsError(''); setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setValue('GpsLatitude',  pos.coords.latitude,  { shouldDirty: true });
        setValue('GpsLongitude', pos.coords.longitude, { shouldDirty: true });
        setGpsLoading(false);
      },
      err => { setGpsError('No se pudo obtener la ubicación: ' + err.message); setGpsLoading(false); },
      { enableHighAccuracy: true },
    );
  };

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      try {
        const [client, activePlans] = await Promise.all([
          clientService.getById(id),
          planService.getAll(true),
        ]);
        setPlans(activePlans);
        setTbnCode(client.TbnCode);
        reset({
          FullName:        client.FullName,
          IdentityCard:    client.IdentityCard,
          PhoneMain:       client.PhoneMain,
          PhoneSecondary:  client.PhoneSecondary ?? '',
          Zone:            client.Zone,
          Street:          client.Street ?? '',
          LocationRef:     client.LocationRef ?? '',
          GpsLatitude:     client.GpsLatitude ?? '' as any,
          GpsLongitude:    client.GpsLongitude ?? '' as any,
          WinboxNumber:    client.WinboxNumber,
          PlanId:          client.Plan?.Id ?? '',
          HasTvCable:      client.HasTvCable,
          OnuSerialNumber: client.OnuSerialNumber ?? '',
        });
      } catch {
        setServerError('No se pudo cargar el cliente.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, reset]);

  const onSubmit = async (data: FormData) => {
    if (!id) return;
    setServerError(''); setSaving(true);
    try {
      await clientService.update(id, {
        FullName:        data.FullName,
        IdentityCard:    data.IdentityCard,
        PhoneMain:       data.PhoneMain,
        PhoneSecondary:  data.PhoneSecondary || undefined,
        Zone:            data.Zone,
        Street:          data.Street || undefined,
        LocationRef:     data.LocationRef || undefined,
        GpsLatitude:     data.GpsLatitude ? Number(data.GpsLatitude) : undefined,
        GpsLongitude:    data.GpsLongitude ? Number(data.GpsLongitude) : undefined,
        WinboxNumber:    data.WinboxNumber,
        PlanId:          data.PlanId,
        HasTvCable:      data.HasTvCable,
        OnuSerialNumber: data.OnuSerialNumber || undefined,
      });
      navigate(`/clients/${id}`);
    } catch (err: unknown) {
      setServerError(extractApiError(err, 'Error al actualizar el cliente.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400">
      <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando datos del cliente...
    </div>
  );

  return (
    <div className="p-6 max-w-3xl mx-auto">

      {}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <button onClick={() => navigate('/clients')} className="hover:text-gray-900">Clientes</button>
        <ChevronRight className="w-4 h-4" />
        <button onClick={() => navigate(`/clients/${id}`)} className="hover:text-gray-900">
          {tbnCode}
        </button>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Editar</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Editar cliente</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            El código <span className="font-mono font-medium text-blue-700">{tbnCode}</span> no puede editarse
          </p>
        </div>
        <button onClick={() => navigate(`/clients/${id}`)} className="btn-secondary text-sm">
          <ArrowLeft className="w-4 h-4" /> Cancelar
        </button>
      </div>

      {serverError && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4 mb-5">
          <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{serverError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>

        {}
        <Section title="Datos personales">
          <Field label="Nombre completo *" error={errors.FullName?.message} full>
            <input type="text"
              className={`input-field ${errors.FullName ? 'input-error' : ''}`}
              {...register('FullName')} />
          </Field>
          <Field label="Carnet de identidad *" error={errors.IdentityCard?.message}>
            <input type="text"
              className={`input-field ${errors.IdentityCard ? 'input-error' : ''}`}
              {...register('IdentityCard')} />
          </Field>
          <Field label="Teléfono principal (WhatsApp) *" error={errors.PhoneMain?.message}>
            <input type="text"
              className={`input-field ${errors.PhoneMain ? 'input-error' : ''}`}
              {...register('PhoneMain')} />
          </Field>
          <Field label="Teléfono secundario">
            <input type="text" className="input-field"
              placeholder="Opcional" {...register('PhoneSecondary')} />
          </Field>
        </Section>

        {}
        <Section title="Ubicación">
          <Field label="Zona o barrio *" error={errors.Zone?.message}>
            <input type="text"
              className={`input-field ${errors.Zone ? 'input-error' : ''}`}
              {...register('Zone')} />
          </Field>
          <Field label="Calle y número">
            <input type="text" className="input-field" {...register('Street')} />
          </Field>
          <Field label="Referencia de ubicación" full>
            <input type="text" className="input-field"
              placeholder="Frente a la cancha, portón azul..." {...register('LocationRef')} />
          </Field>

          {}
          <div className="sm:col-span-2 border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-600 mb-3">Coordenadas GPS (opcional)</p>
            <div className="flex items-center gap-3 mb-2">
              <button
                type="button"
                onClick={captureCurrentLocation}
                disabled={gpsLoading}
                className="flex items-center gap-2 text-sm bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
              >
                {gpsLoading
                  ? <><Loader2 className="w-3 h-3 animate-spin" /> Obteniendo…</>
                  : <><Navigation className="w-3.5 h-3.5" /> Capturar ubicación actual</>}
              </button>
              {hasGps && (
                <button
                  type="button"
                  onClick={() => {
                    setValue('GpsLatitude', '' as any, { shouldDirty: true });
                    setValue('GpsLongitude', '' as any, { shouldDirty: true });
                  }}
                  className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
                >
                  <XIcon className="w-3 h-3" /> Limpiar GPS
                </button>
              )}
            </div>
            {gpsError && <p className="text-xs text-red-600 mb-2">{gpsError}</p>}
            <div className="grid grid-cols-2 gap-3 mb-2">
              <div>
                <label className="label">Latitud</label>
                <input type="number" step="any" readOnly={hasGps}
                  className={`input-field ${hasGps ? 'bg-gray-50' : ''}`}
                  placeholder="-17.3935" {...register('GpsLatitude')} />
              </div>
              <div>
                <label className="label">Longitud</label>
                <input type="number" step="any" readOnly={hasGps}
                  className={`input-field ${hasGps ? 'bg-gray-50' : ''}`}
                  placeholder="-66.1570" {...register('GpsLongitude')} />
              </div>
            </div>
            {hasGps && (
              <Suspense fallback={<div className="h-48 bg-gray-100 rounded-lg animate-pulse" />}>
                <GpsMiniMap
                  lat={Number(gpsLat)}
                  lng={Number(gpsLng)}
                  onChange={(lat, lng) => {
                    setValue('GpsLatitude',  lat, { shouldDirty: true });
                    setValue('GpsLongitude', lng, { shouldDirty: true });
                  }}
                />
              </Suspense>
            )}
          </div>
        </Section>

        {}
        <Section title="Datos del servicio">
          <Field label="Número Winbox *" error={errors.WinboxNumber?.message}>
            <input type="text"
              className={`input-field ${errors.WinboxNumber ? 'input-error' : ''}`}
              {...register('WinboxNumber')} />
          </Field>
          <Field label="Plan contratado *" error={errors.PlanId?.message}>
            <select className={`input-field ${errors.PlanId ? 'input-error' : ''}`}
              {...register('PlanId')}>
              <option value="">Selecciona un plan</option>
              {plans.map(p => (
                <option key={p.Id} value={p.Id}>{p.DisplayLabel}</option>
              ))}
            </select>
          </Field>
          <Field label="Número de serie ONU">
            <input type="text" className="input-field"
              placeholder="Opcional" {...register('OnuSerialNumber')} />
          </Field>
          <Field label="¿Incluye TV cable?">
            <label className="flex items-center gap-2 mt-1 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded" {...register('HasTvCable')} />
              <span className="text-sm text-gray-700">Sí, incluye TV cable</span>
            </label>
          </Field>
        </Section>

        {}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-5 text-xs text-blue-700">
          Todos los cambios quedan registrados en el log de auditoría con los valores anteriores y nuevos.
        </div>

        {}
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={() => navigate(`/clients/${id}`)}
            className="btn-secondary">
            Cancelar
          </button>
          <button type="submit" disabled={saving || !isDirty} className="btn-primary px-8">
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
              : <><Check className="w-4 h-4" /> Guardar cambios</>}
          </button>
        </div>
      </form>
    </div>
  );
}
