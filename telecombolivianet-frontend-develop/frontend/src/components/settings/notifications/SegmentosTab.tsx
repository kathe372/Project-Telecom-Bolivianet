import {
  Eye, Loader2, MessageSquare, Plus, Save, Trash2, Users,
} from 'lucide-react';
import {
  type NotifSegmentDto, type SegmentConditionGroup, type SegmentCondition, type SegmentCampo,
} from '@/services/notificationService';

const CAMPOS_SEGMENTO: { value: SegmentCampo; label: string }[] = [
  { value: 'deuda',     label: 'Deuda (Bs.)' },
  { value: 'dias_mora', label: 'Días de mora' },
  { value: 'zona',      label: 'Zona' },
  { value: 'plan',      label: 'Plan' },
  { value: 'estado',    label: 'Estado' },
];

export type SegmentFormState = {
  Nombre: string;
  Descripcion: string;
  Reglas: SegmentConditionGroup[];
};

export function newSegmentForm(): SegmentFormState {
  return { Nombre: '', Descripcion: '', Reglas: [{ Condiciones: [{ Campo: 'zona', Operador: '=', Valor: '' }] }] };
}

function SegmentBuilder({
  reglas, onChange,
}: {
  reglas: SegmentConditionGroup[];
  onChange: (r: SegmentConditionGroup[]) => void;
}) {
  const addGroup = () =>
    onChange([...reglas, { Condiciones: [{ Campo: 'zona', Operador: '=', Valor: '' }] }]);

  const removeGroup = (gi: number) =>
    onChange(reglas.filter((_, i) => i !== gi));

  const addCond = (gi: number) => {
    const next = reglas.map((g, i) => i === gi
      ? { ...g, Condiciones: [...g.Condiciones, { Campo: 'zona' as SegmentCampo, Operador: '=' as const, Valor: '' }] }
      : g);
    onChange(next);
  };

  const removeCond = (gi: number, ci: number) => {
    const next = reglas.map((g, i) => i === gi
      ? { ...g, Condiciones: g.Condiciones.filter((_, j) => j !== ci) }
      : g);
    onChange(next.filter(g => g.Condiciones.length > 0));
  };

  const updateCond = (gi: number, ci: number, field: keyof SegmentCondition, val: string) => {
    const next = reglas.map((g, i) => i === gi
      ? {
          ...g,
          Condiciones: g.Condiciones.map((c, j) => j === ci ? { ...c, [field]: val } : c),
        }
      : g);
    onChange(next);
  };

  const numericCampos: SegmentCampo[] = ['deuda', 'dias_mora'];
  const allOps = ['=', '!=', '>', '<', '>=', '<='];
  const strOps = ['=', '!='];

  return (
    <div className="space-y-3">
      {reglas.map((grupo, gi) => (
        <div key={gi} className="border border-blue-200 rounded-lg p-3 bg-blue-50/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
              {gi === 0 ? 'Grupo 1' : `O bien... Grupo ${gi + 1}`}
            </span>
            {reglas.length > 1 && (
              <button onClick={() => removeGroup(gi)} className="text-red-500 hover:text-red-700">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {grupo.Condiciones.map((cond, ci) => (
            <div key={ci} className="flex items-center gap-2 mb-2">
              {ci > 0 && (
                <span className="text-xs font-medium text-gray-500 w-6">Y</span>
              )}
              <select
                value={cond.Campo}
                onChange={e => updateCond(gi, ci, 'Campo', e.target.value)}
                className="text-xs border rounded px-2 py-1 bg-white"
              >
                {CAMPOS_SEGMENTO.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              <select
                value={cond.Operador}
                onChange={e => updateCond(gi, ci, 'Operador', e.target.value)}
                className="text-xs border rounded px-2 py-1 bg-white w-14"
              >
                {(numericCampos.includes(cond.Campo) ? allOps : strOps).map(op => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
              <input
                value={cond.Valor}
                onChange={e => updateCond(gi, ci, 'Valor', e.target.value)}
                placeholder="valor"
                className="text-xs border rounded px-2 py-1 bg-white flex-1 min-w-0"
              />
              <button onClick={() => removeCond(gi, ci)} className="text-red-400 hover:text-red-600 shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button
            onClick={() => addCond(gi)}
            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-1"
          >
            <Plus className="w-3 h-3" /> Agregar condición AND
          </button>
        </div>
      ))}
      <button
        onClick={addGroup}
        className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 border border-dashed border-indigo-300 rounded px-3 py-1.5 w-full justify-center"
      >
        <Plus className="w-3 h-3" /> Agregar grupo OR
      </button>
    </div>
  );
}

export function SegmentosTab({
  segments, segmentForm, onFormChange, editSegId,
  onNew, onEdit, onDelete, onPreview, previewCount,
  onSave, saving, onCancel,
}: {
  segments: NotifSegmentDto[];
  segmentForm: SegmentFormState | null;
  onFormChange: (f: SegmentFormState) => void;
  editSegId: string | null;
  onNew: () => void;
  onEdit: (seg: NotifSegmentDto) => void;
  onDelete: (id: string, nombre: string) => void;
  onPreview: () => void;
  previewCount: number | null;
  onSave: () => void;
  saving: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Segmentos guardados</h3>
          <button
            onClick={onNew}
            className="flex items-center gap-1 text-xs bg-indigo-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-indigo-700"
          >
            <Plus className="w-3.5 h-3.5" /> Nuevo segmento
          </button>
        </div>
        {segments.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">No hay segmentos creados.</p>
        )}
        {segments.map(seg => (
          <div key={seg.Id} className="bg-white border border-gray-200 rounded-lg p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{seg.Nombre}</p>
                {seg.Descripcion && <p className="text-xs text-gray-500 truncate">{seg.Descripcion}</p>}
                <p className="text-xs text-indigo-600 mt-1">
                  <Users className="w-3 h-3 inline mr-0.5" />
                  {seg.ClientesEstimados !== null ? `~${seg.ClientesEstimados} clientes` : '—'}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => onEdit(seg)} className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded">
                  <MessageSquare className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => onDelete(seg.Id, seg.Nombre)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {segmentForm ? (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-800">
            {editSegId ? 'Editar segmento' : 'Nuevo segmento'}
          </h3>
          <input
            value={segmentForm.Nombre}
            onChange={e => onFormChange({ ...segmentForm, Nombre: e.target.value })}
            placeholder="Nombre del segmento*"
            className="w-full border rounded px-3 py-2 text-sm"
          />
          <input
            value={segmentForm.Descripcion}
            onChange={e => onFormChange({ ...segmentForm, Descripcion: e.target.value })}
            placeholder="Descripción (opcional)"
            className="w-full border rounded px-3 py-2 text-sm"
          />

          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">
              Reglas — grupos OR, condiciones AND
            </p>
            <SegmentBuilder
              reglas={segmentForm.Reglas}
              onChange={r => onFormChange({ ...segmentForm, Reglas: r })}
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onPreview}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 px-2.5 py-1.5 rounded-lg"
            >
              <Eye className="w-3.5 h-3.5" /> Calcular clientes
            </button>
            {previewCount !== null && (
              <span className="text-sm font-semibold text-indigo-700">
                <Users className="w-3.5 h-3.5 inline mr-1" />
                {previewCount} clientes coinciden
              </span>
            )}
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Guardar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-xl">
          Selecciona o crea un segmento para editarlo
        </div>
      )}
    </div>
  );
}
