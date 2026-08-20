import { useEffect, useState, useCallback } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus, Pencil, Loader2, AlertCircle,
  Check, X, Wifi, ToggleLeft, ToggleRight,
  Info, AlertTriangle,
} from 'lucide-react';
import { planService } from '@/services/clientService';
import type { PlanDto } from '@/types/client.types';
import { extractApiError } from '@/utils/apiError';
import { formatBs } from '@/utils/currency';
import { usePageTitle } from '@/hooks/usePageTitle';

const planSchema = z.object({
  Name:         z.string().min(2, 'Obligatorio').max(100),
  SpeedMb:      z.coerce.number().int().min(1, 'Mínimo 1 Mb'),
  MonthlyPrice: z.coerce.number().min(1, 'Debe ser mayor a 0'),
  IsActive:     z.boolean().optional(),
  ChangeReason: z.string().max(500).optional(),
});
type PlanForm = z.infer<typeof planSchema>;

function DeactivateConfirmModal({
  plan,
  onConfirm,
  onCancel,
  confirming,
  error,
}: {
  plan:       PlanDto;
  onConfirm:  () => void;
  onCancel:   () => void;
  confirming: boolean;
  error:      string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h3 className="font-semibold text-gray-900">Desactivar plan</h3>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-700">
            Estás a punto de desactivar{' '}
            <span className="font-semibold">{plan.Name}</span>.
          </p>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            <p className="font-medium mb-1">Antes de continuar:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Los clientes asignados a este plan impedirán la operación.</li>
              <li>Migra a los clientes a otro plan antes de desactivarlo.</li>
              <li>El plan dejará de aparecer en el formulario de registro.</li>
            </ul>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              onClick={onConfirm}
              disabled={confirming}
              className="flex items-center justify-center gap-2 flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {confirming
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Desactivando...</>
                : 'Desactivar de todos modos'}
            </button>
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanModal({
  title,
  defaultValues,
  onSave,
  onClose,
  saving,
  error,
}: {
  title:          string;
  defaultValues?: Partial<PlanForm>;
  onSave:         (data: PlanForm) => void;
  onClose:        () => void;
  saving:         boolean;
  error:          string;
}) {
  const isEditing = defaultValues !== undefined;

  const {
    register, handleSubmit, control,
    formState: { errors },
  } = useForm<PlanForm>({
    resolver: zodResolver(planSchema),
    defaultValues: defaultValues ?? { IsActive: true },
  });

  const watchedPrice = useWatch({ control, name: 'MonthlyPrice' });
  const priceChanged = isEditing &&
    Number(watchedPrice) !== Number(defaultValues?.MonthlyPrice);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
            </div>
          )}

          {}
          {isEditing && (
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-xs text-blue-700">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium mb-0.5">¿Cuándo aplican los cambios?</p>
                <ul className="space-y-0.5 text-blue-600">
                  <li>· <span className="font-medium">Nombre / velocidad:</span> inmediatamente en registros nuevos.</li>
                  <li>· <span className="font-medium">Precio:</span> en facturas del 1ro del próximo mes para clientes existentes.</li>
                </ul>
              </div>
            </div>
          )}

          {}
          {priceChanged && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>
                Cambiaste el precio. Las facturas ya generadas y los clientes
                actuales <span className="font-medium">no se verán afectados</span> hasta
                el próximo mes.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSave)} noValidate className="space-y-4">
            <div>
              <label className="label">Nombre del plan *</label>
              <input type="text" placeholder="Plan Plata"
                className={`input-field ${errors.Name ? 'input-error' : ''}`}
                {...register('Name')} />
              {errors.Name && <p className="error-msg">{errors.Name.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Velocidad (Mb) *</label>
                <input type="number" min="1" placeholder="50"
                  className={`input-field ${errors.SpeedMb ? 'input-error' : ''}`}
                  {...register('SpeedMb')} />
                {errors.SpeedMb && <p className="error-msg">{errors.SpeedMb.message}</p>}
              </div>
              <div>
                <label className="label">Precio mensual (Bs.) *</label>
                <input type="number" min="1" step="0.01" placeholder="149"
                  className={`input-field ${errors.MonthlyPrice ? 'input-error' : ''}`}
                  {...register('MonthlyPrice')} />
                {errors.MonthlyPrice && <p className="error-msg">{errors.MonthlyPrice.message}</p>}
              </div>
            </div>

            {isEditing && (
              <>
                <div>
                  <label className="label">Motivo del cambio (opcional)</label>
                  <input
                    type="text"
                    placeholder="Ej: Ajuste de precios Q2 2026"
                    className="input-field"
                    {...register('ChangeReason')}
                  />
                  <p className="text-xs text-gray-400 mt-0.5">Se guarda en el historial de versiones del plan.</p>
                </div>
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 rounded" {...register('IsActive')} />
                    <span className="text-sm text-gray-700">Plan activo (visible en el formulario de registro)</span>
                  </label>
                </div>
              </>
            )}

            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={saving} className="btn-primary flex-1">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
              <button type="button" onClick={onClose} className="btn-secondary flex-1">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function PlansPage() {
  usePageTitle('Planes');
  const [plans,            setPlans]            = useState<PlanDto[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [error,            setError]            = useState('');
  const [showCreate,       setShowCreate]       = useState(false);
  const [editTarget,       setEditTarget]       = useState<PlanDto | null>(null);
  const [actionError,      setActionError]      = useState('');
  const [saving,           setSaving]           = useState(false);
  const [confirmDeactivate,    setConfirmDeactivate]    = useState<PlanDto | null>(null);
  const [deactivating,         setDeactivating]         = useState(false);
  const [deactivateError,      setDeactivateError]      = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      setPlans(await planService.getAll());
    } catch {
      setError('Error al cargar los planes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (data: PlanForm) => {
    setActionError(''); setSaving(true);
    try {
      await planService.create({ Name: data.Name, SpeedMb: data.SpeedMb, MonthlyPrice: data.MonthlyPrice });
      setShowCreate(false);
      load();
    } catch (err: unknown) {
      setActionError(extractApiError(err, 'Error al crear el plan.'));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (data: PlanForm) => {
    if (!editTarget) return;
    setActionError(''); setSaving(true);
    try {
      await planService.update(editTarget.Id, {
        Name: data.Name, SpeedMb: data.SpeedMb,
        MonthlyPrice: data.MonthlyPrice, IsActive: data.IsActive ?? true,
        ChangeReason: data.ChangeReason || undefined,
      });
      setEditTarget(null);
      load();
    } catch (err: unknown) {
      setActionError(extractApiError(err, 'Error al actualizar el plan.'));
    } finally {
      setSaving(false);
    }
  };

  const requestDeactivate = (plan: PlanDto) => {
    setDeactivateError('');
    setConfirmDeactivate(plan);
  };

  const confirmDeactivation = async () => {
    if (!confirmDeactivate) return;
    setDeactivating(true); setDeactivateError('');
    try {
      await planService.update(confirmDeactivate.Id, {
        Name:         confirmDeactivate.Name,
        SpeedMb:      confirmDeactivate.SpeedMb,
        MonthlyPrice: confirmDeactivate.MonthlyPrice,
        IsActive:     false,
      });
      setConfirmDeactivate(null);
      load();
    } catch (err: unknown) {
      setDeactivateError(extractApiError(err, 'Error al desactivar el plan.'));
    } finally {
      setDeactivating(false);
    }
  };

  const activatePlan = async (plan: PlanDto) => {
    setActionError('');
    try {
      await planService.update(plan.Id, {
        Name: plan.Name, SpeedMb: plan.SpeedMb,
        MonthlyPrice: plan.MonthlyPrice, IsActive: true,
      });
      load();
    } catch (err: unknown) {
      setActionError(extractApiError(err, 'Error al activar el plan.'));
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">

      {}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Planes de internet</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Los planes activos se muestran al registrar clientes
          </p>
        </div>
        <button onClick={() => { setShowCreate(true); setActionError(''); }}
          className="btn-primary">
          <Plus className="w-4 h-4" /> Nuevo plan
        </button>
      </div>

      {}
      {actionError && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{actionError}</span>
          <button onClick={() => setActionError('')} className="ml-auto text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando planes...
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map(plan => (
            <div key={plan.Id}
              className={`card p-5 transition-opacity ${!plan.IsActive ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center
                    ${plan.IsActive ? 'bg-blue-100' : 'bg-gray-100'}`}>
                    <Wifi className={`w-5 h-5 ${plan.IsActive ? 'text-blue-600' : 'text-gray-400'}`} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{plan.Name}</p>
                    <p className="text-xs text-gray-500">{plan.SpeedMb} Mb</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => { setEditTarget(plan); setActionError(''); }}
                    title="Editar"
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => plan.IsActive ? requestDeactivate(plan) : activatePlan(plan)}
                    title={plan.IsActive ? 'Desactivar' : 'Activar'}
                    className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors"
                  >
                    {plan.IsActive
                      ? <ToggleRight className="w-4 h-4 text-green-600" />
                      : <ToggleLeft className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3">
                <p className="text-2xl font-bold text-gray-900">
                  {formatBs(plan.MonthlyPrice)}
                  <span className="text-sm font-normal text-gray-400">/mes</span>
                </p>
                <div className="flex items-center justify-between mt-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full
                    ${plan.IsActive
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-500'}`}>
                    {plan.IsActive ? 'Activo' : 'Inactivo'}
                  </span>
                  <span className="text-xs text-gray-400">{plan.DisplayLabel.split('—').pop()?.trim()}</span>
                </div>
              </div>
            </div>
          ))}

          {plans.length === 0 && (
            <div className="sm:col-span-3 text-center py-12 text-gray-400">
              No hay planes configurados. Crea el primero.
            </div>
          )}
        </div>
      )}

      {}
      {!loading && plans.length > 0 && (
        <div className="mt-5 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
          Los cambios de precio en un plan no afectan a clientes existentes.
          Las nuevas facturas generadas a partir del próximo mes usarán el precio actualizado.
        </div>
      )}

      {}
      {confirmDeactivate && (
        <DeactivateConfirmModal
          plan={confirmDeactivate}
          onConfirm={confirmDeactivation}
          onCancel={() => { setConfirmDeactivate(null); setDeactivateError(''); }}
          confirming={deactivating}
          error={deactivateError}
        />
      )}

      {}
      {showCreate && (
        <PlanModal
          title="Nuevo plan"
          onSave={handleCreate}
          onClose={() => setShowCreate(false)}
          saving={saving}
          error={actionError}
        />
      )}

      {}
      {editTarget && (
        <PlanModal
          title={`Editar: ${editTarget.Name}`}
          defaultValues={{
            Name:         editTarget.Name,
            SpeedMb:      editTarget.SpeedMb,
            MonthlyPrice: editTarget.MonthlyPrice,
            IsActive:     editTarget.IsActive,
          }}
          onSave={handleEdit}
          onClose={() => setEditTarget(null)}
          saving={saving}
          error={actionError}
        />
      )}
    </div>
  );
}
