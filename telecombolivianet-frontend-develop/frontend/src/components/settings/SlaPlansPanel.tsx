import { useState, useEffect } from 'react';
import { Pencil, Plus, Loader2, AlertCircle, CheckCircle2, X, Save, ShieldCheck } from 'lucide-react';
import { ticketService } from '@/services/ticketService';
import type { SlaPlanDto, CreateSlaPlanRequest } from '@/types/ticket.types';
import { extractApiError } from '@/utils/apiError';


const PRIORITY_ORDER = ['Critica', 'Alta', 'Media', 'Baja'];

const PRIORITY_STYLES: Record<string, string> = {
  Critica: 'bg-red-100 text-red-700 border border-red-200',
  Alta:    'bg-orange-100 text-orange-700 border border-orange-200',
  Media:   'bg-yellow-100 text-yellow-700 border border-yellow-200',
  Baja:    'bg-green-100 text-green-700 border border-green-200',
};

function fmtMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

interface EditModalProps {
  plan:     SlaPlanDto | null;
  onSave:   (data: CreateSlaPlanRequest & { IsActive?: boolean }) => Promise<void>;
  onClose:  () => void;
  saving:   boolean;
  error:    string;
}

function SlaPlanEditModal({ plan, onSave, onClose, saving, error }: EditModalProps) {
  const isNew = plan === null;

  const [form, setForm] = useState({
    Name:                   plan?.Name                   ?? '',
    Priority:               plan?.Priority               ?? 'Media',
    FirstResponseMinutes:   plan?.FirstResponseMinutes   ?? 120,
    ResolutionMinutes:      plan?.ResolutionMinutes      ?? 1440,
    Schedule:               plan?.Schedule               ?? 'Laboral',
    IsActive:               plan?.IsActive               ?? true,
  });
  const [validationErr, setValidationErr] = useState('');

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const validate = (): boolean => {
    if (!form.Name.trim()) {
      setValidationErr('El nombre del plan es obligatorio.');
      return false;
    }
    if (form.FirstResponseMinutes < 1) {
      setValidationErr('El tiempo de primera respuesta debe ser al menos 1 minuto.');
      return false;
    }
    if (form.ResolutionMinutes <= form.FirstResponseMinutes) {
      setValidationErr('El tiempo de resolución debe ser mayor al de primera respuesta.');
      return false;
    }
    setValidationErr('');
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    await onSave({ ...form });
  };

  const displayErr = validationErr || error;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col outline-none">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            {isNew ? 'Nuevo plan SLA' : 'Editar plan SLA'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="label">Nombre del plan *</label>
            <input
              className="input-field"
              maxLength={100}
              placeholder="ej: Crítico 24/7"
              value={form.Name}
              onChange={e => set('Name', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Prioridad *</label>
              <select
                className="input-field"
                value={form.Priority}
                onChange={e => set('Priority', e.target.value)}
                disabled={!isNew}
              >
                {PRIORITY_ORDER.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              {!isNew && (
                <p className="text-xs text-gray-400 mt-1">La prioridad no puede cambiarse.</p>
              )}
            </div>
            <div>
              <label className="label">Horario *</label>
              <select
                className="input-field"
                value={form.Schedule}
                onChange={e => set('Schedule', e.target.value)}
              >
                <option value="Veinticuatro7">24/7 (continuo)</option>
                <option value="Laboral">Laboral (L-V, 8-18)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Primera respuesta *</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={9999}
                  className="input-field"
                  value={form.FirstResponseMinutes}
                  onChange={e => set('FirstResponseMinutes', parseInt(e.target.value) || 0)}
                />
                <span className="text-xs text-gray-400 whitespace-nowrap">min</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">{fmtMinutes(form.FirstResponseMinutes)}</p>
            </div>
            <div>
              <label className="label">Resolución *</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={99999}
                  className="input-field"
                  value={form.ResolutionMinutes}
                  onChange={e => set('ResolutionMinutes', parseInt(e.target.value) || 0)}
                />
                <span className="text-xs text-gray-400 whitespace-nowrap">min</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">{fmtMinutes(form.ResolutionMinutes)}</p>
            </div>
          </div>

          {!isNew && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="sla-active"
                checked={form.IsActive}
                onChange={e => set('IsActive', e.target.checked)}
                className="w-4 h-4 accent-blue-600"
              />
              <label htmlFor="sla-active" className="text-sm text-gray-700">Plan activo</label>
            </div>
          )}

          {displayErr && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {displayErr}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-gray-100">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Save className="w-4 h-4" />}
            {isNew ? 'Crear plan' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SlaPlansPanel() {
  const [plans,     setPlans]     = useState<SlaPlanDto[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [loadErr,   setLoadErr]   = useState('');
  const [editPlan,  setEditPlan]  = useState<SlaPlanDto | null | 'new'>('new' as never);
  const [showModal, setShowModal] = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [saveErr,   setSaveErr]   = useState('');
  const [saved,     setSaved]     = useState(false);

  const load = async () => {
    setLoading(true); setLoadErr('');
    try {
      const data = await ticketService.getSlaPlans();
      const sorted = [...data].sort(
        (a, b) => PRIORITY_ORDER.indexOf(a.Priority) - PRIORITY_ORDER.indexOf(b.Priority)
      );
      setPlans(sorted);
    } catch {
      setLoadErr('No se pudieron cargar los planes SLA.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openEdit = (plan: SlaPlanDto) => {
    setEditPlan(plan);
    setSaveErr('');
    setSaved(false);
    setShowModal(true);
  };

  const openNew = () => {
    setEditPlan(null);
    setSaveErr('');
    setSaved(false);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSaveErr('');
  };

  const handleSave = async (data: CreateSlaPlanRequest & { IsActive?: boolean }) => {
    setSaving(true); setSaveErr(''); setSaved(false);
    try {
      if (editPlan === null) {
        await ticketService.createSlaPlan(data);
      } else {
        await ticketService.updateSlaPlan((editPlan as SlaPlanDto).Id, data);
      }
      setSaved(true);
      closeModal();
      await load();
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      setSaveErr(extractApiError(e, 'Error al guardar el plan SLA.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-24">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">
            Define los plazos de atención para cada nivel de prioridad.
            El sistema aplica el plan correspondiente automáticamente al crear cada ticket.
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 shrink-0 ml-4"
        >
          <Plus className="w-4 h-4" /> Nuevo plan
        </button>
      </div>

      {loadErr && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {loadErr}
        </div>
      )}

      {saved && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" /> Plan SLA guardado correctamente.
        </div>
      )}

      {plans.length === 0 && !loadErr ? (
        <p className="text-sm text-gray-400 text-center py-8">
          No hay planes SLA configurados. Crea uno con el botón "Nuevo plan".
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Prioridad</th>
                <th className="text-left px-4 py-3 font-medium">Nombre</th>
                <th className="text-left px-4 py-3 font-medium">1ª Respuesta</th>
                <th className="text-left px-4 py-3 font-medium">Resolución</th>
                <th className="text-left px-4 py-3 font-medium">Horario</th>
                <th className="text-left px-4 py-3 font-medium">Estado</th>
                <th className="text-right px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {plans.map(plan => (
                <tr key={plan.Id} className="bg-white hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PRIORITY_STYLES[plan.Priority] ?? 'bg-gray-100 text-gray-600'}`}>
                      {plan.Priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">{plan.Name}</td>
                  <td className="px-4 py-3 text-gray-600">{fmtMinutes(plan.FirstResponseMinutes)}</td>
                  <td className="px-4 py-3 text-gray-600">{fmtMinutes(plan.ResolutionMinutes)}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {plan.Schedule === 'Veinticuatro7' ? '24/7' : 'L-V 8-18'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${plan.IsActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {plan.IsActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => openEdit(plan)}
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400">
        Los cambios aplican solo a los tickets nuevos. Los tickets existentes conservan su deadline original.
      </p>

      {showModal && (
        <SlaPlanEditModal
          plan={editPlan as SlaPlanDto | null}
          onSave={handleSave}
          onClose={closeModal}
          saving={saving}
          error={saveErr}
        />
      )}
    </div>
  );
}
