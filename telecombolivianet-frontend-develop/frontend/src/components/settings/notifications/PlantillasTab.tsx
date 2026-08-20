import {
  AlertCircle, ArrowDown, ArrowUp, CheckCircle2, Copy, ExternalLink, Eye, EyeOff,
  Loader2, Plus, RotateCcw, Save, Tag, Trash2, XCircle,
} from 'lucide-react';
import {
  ALL_VARIABLES, NOTIF_TYPE_LABELS, HSM_STATUS_COLORS, CATEGORIA_LABELS,
  type NotifTemplateDto, type NotifType, type TemplateCategory, type HsmStatus,
} from '@/services/notificationService';
import { WhatsAppBubble } from './WhatsAppBubble';

const CATEGORIAS: TemplateCategory[] = ['Cobro','Bienvenida','Tecnico','Ticket','General'];
const HSM_STATUSES: HsmStatus[] = ['Aprobada','Pendiente','Rechazada'];

export function PlantillasTab({
  plantillas, selectedTipo, onSelectTipo,
  filterCategoria, onFilterCategoria, filterHsm, onFilterHsm,
  textoEdit, onTextoChange,
  categoriaEdit, onCategoriaChange, hsmEdit, onHsmChange,
  metaTemplateName, onMetaTemplateName, metaLanguageCode, onMetaLanguageCode,
  metaParamOrder, onAddMetaParam, onRemoveMetaParam, onUpdateMetaParam, onMoveMetaParam,
  showPreview, onTogglePreview, previewData,
  onInsertVariable, onRestore, onSave, saving,
}: {
  plantillas: NotifTemplateDto[];
  selectedTipo: NotifType;
  onSelectTipo: (tipo: NotifType) => void;
  filterCategoria: TemplateCategory | '';
  onFilterCategoria: (c: TemplateCategory | '') => void;
  filterHsm: HsmStatus | '';
  onFilterHsm: (h: HsmStatus | '') => void;
  textoEdit: string;
  onTextoChange: (val: string) => void;
  categoriaEdit: TemplateCategory;
  onCategoriaChange: (c: TemplateCategory) => void;
  hsmEdit: HsmStatus;
  onHsmChange: (h: HsmStatus) => void;
  metaTemplateName: string;
  onMetaTemplateName: (v: string) => void;
  metaLanguageCode: string;
  onMetaLanguageCode: (v: string) => void;
  metaParamOrder: string[];
  onAddMetaParam: () => void;
  onRemoveMetaParam: (i: number) => void;
  onUpdateMetaParam: (i: number, val: string) => void;
  onMoveMetaParam: (i: number, dir: -1 | 1) => void;
  showPreview: boolean;
  onTogglePreview: () => void;
  previewData: { texto: string; vars: string[] } | null;
  onInsertVariable: (variable: string) => void;
  onRestore: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const filteredPlantillas = plantillas.filter(p =>
    (!filterCategoria || p.Categoria === filterCategoria) &&
    (!filterHsm || p.HsmStatus === filterHsm)
  );

  return (
    <div className="grid grid-cols-3 gap-5">
      <div className="col-span-1 space-y-2">
        <div className="flex gap-2">
          <select
            value={filterCategoria}
            onChange={e => onFilterCategoria(e.target.value as TemplateCategory | '')}
            className="flex-1 border rounded px-2 py-1.5 text-xs"
          >
            <option value="">Todas las categorías</option>
            {CATEGORIAS.map(c => <option key={c} value={c}>{CATEGORIA_LABELS[c]}</option>)}
          </select>
          <select
            value={filterHsm}
            onChange={e => onFilterHsm(e.target.value as HsmStatus | '')}
            className="flex-1 border rounded px-2 py-1.5 text-xs"
          >
            <option value="">Todos los HSM</option>
            {HSM_STATUSES.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>

        {filteredPlantillas.map(p => (
          <button
            key={p.Tipo}
            onClick={() => onSelectTipo(p.Tipo)}
            className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
              selectedTipo === p.Tipo
                ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                : 'bg-white border-gray-200 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium truncate">{NOTIF_TYPE_LABELS[p.Tipo]}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded border font-medium shrink-0 ml-1 ${HSM_STATUS_COLORS[p.HsmStatus]}`}>
                {p.HsmStatus === 'Rechazada' && <XCircle className="w-3 h-3 inline mr-0.5" />}
                {p.HsmStatus}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Tag className="w-3 h-3 text-gray-400" />
              <span className="text-xs text-gray-500">{CATEGORIA_LABELS[p.Categoria]}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="col-span-2 space-y-3">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs font-medium text-gray-600 block mb-1">Categoría</label>
            <select
              value={categoriaEdit}
              onChange={e => onCategoriaChange(e.target.value as TemplateCategory)}
              className="w-full border rounded px-2 py-1.5 text-sm"
            >
              {CATEGORIAS.map(c => <option key={c} value={c}>{CATEGORIA_LABELS[c]}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="text-xs font-medium text-gray-600 block mb-1">Estado HSM</label>
            <select
              value={hsmEdit}
              onChange={e => onHsmChange(e.target.value as HsmStatus)}
              className={`w-full border rounded px-2 py-1.5 text-sm ${HSM_STATUS_COLORS[hsmEdit]}`}
            >
              {HSM_STATUSES.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
        </div>

        {hsmEdit === 'Rechazada' && (
          <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
            <XCircle className="w-3.5 h-3.5 shrink-0" />
            Esta plantilla está Rechazada y no puede activarse en triggers.
          </div>
        )}

        <details className="border border-green-200 rounded-lg bg-green-50/30" open={!!metaTemplateName}>
          <summary className="px-3 py-2 text-xs font-semibold text-green-800 cursor-pointer hover:bg-green-50 flex items-center gap-1.5">
            <ExternalLink className="w-3.5 h-3.5" />
            Configuración Meta WhatsApp Business API
            {metaTemplateName
              ? <span className="ml-auto text-green-700 font-mono">{metaTemplateName}</span>
              : <span className="ml-auto text-amber-600 font-normal">Sin configurar — usa texto libre (sesión 24h)</span>
            }
          </summary>
          <div className="px-3 pb-3 pt-2 space-y-3">
            <div className="p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
              <strong>Importante:</strong> crea el template en{' '}
              <span className="font-mono">business.facebook.com → WhatsApp Manager → Message Templates</span>
              {' '}antes de configurarlo aquí. El template debe estar aprobado por Meta y el nombre debe coincidir exactamente.
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Nombre del template en Meta
                </label>
                <input
                  type="text"
                  value={metaTemplateName}
                  onChange={e => onMetaTemplateName(e.target.value.toLowerCase().replace(/\s/g, '_'))}
                  placeholder="ej: recordatorio_r1"
                  className="w-full border rounded px-2 py-1.5 text-sm font-mono"
                />
                <p className="text-xs text-gray-400 mt-0.5">snake_case, minúsculas</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Idioma
                </label>
                <select
                  value={metaLanguageCode}
                  onChange={e => onMetaLanguageCode(e.target.value)}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                >
                  <option value="es">es — Español</option>
                  <option value="es_419">es_419 — Español (Latinoamérica)</option>
                  <option value="es_MX">es_MX — Español (México)</option>
                  <option value="es_AR">es_AR — Español (Argentina)</option>
                  <option value="en_US">en_US — English (US)</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-600">
                  Parámetros posicionales ({"{{1}}"}, {"{{2}}"}, …)
                </label>
                <button
                  onClick={onAddMetaParam}
                  className="flex items-center gap-1 text-xs text-green-700 hover:text-green-900 border border-green-300 rounded px-2 py-0.5"
                >
                  <Plus className="w-3 h-3" /> Agregar
                </button>
              </div>
              {metaParamOrder.length === 0 && (
                <p className="text-xs text-gray-400 italic">
                  Sin parámetros — agrega los que usa tu template en Meta.
                </p>
              )}
              <div className="space-y-1.5">
                {metaParamOrder.map((param, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs font-mono text-gray-500 w-8 shrink-0 text-right">
                      {`{{${i + 1}}}`}
                    </span>
                    <select
                      value={param}
                      onChange={e => onUpdateMetaParam(i, e.target.value)}
                      className="flex-1 border rounded px-2 py-1 text-xs font-mono"
                    >
                      <option value="">— seleccionar variable —</option>
                      {ALL_VARIABLES.map(v => (
                        <option key={v.variable} value={v.variable.replace(/\{|\}/g, '')}>
                          {v.variable} — {v.descripcion}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => onMoveMetaParam(i, -1)}
                      disabled={i === 0}
                      className="text-gray-400 hover:text-gray-700 disabled:opacity-30"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onMoveMetaParam(i, 1)}
                      disabled={i === metaParamOrder.length - 1}
                      className="text-gray-400 hover:text-gray-700 disabled:opacity-30"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => onRemoveMetaParam(i)} className="text-red-400 hover:text-red-600">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              {metaParamOrder.length > 0 && (
                <p className="text-xs text-gray-400 mt-1.5">
                  El template en Meta debe tener <strong>{metaParamOrder.length}</strong> variable(s) en el body: {Array.from({ length: metaParamOrder.length }, (_, i) => `{{${i + 1}}}`).join(', ')}
                </p>
              )}
            </div>

            {metaTemplateName && (
              <div className={`flex items-center gap-2 p-2 rounded text-xs border ${
                hsmEdit === 'Aprobada'
                  ? 'bg-green-50 border-green-200 text-green-800'
                  : hsmEdit === 'Pendiente'
                  ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}>
                {hsmEdit === 'Aprobada'
                  ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  : <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                }
                {hsmEdit === 'Aprobada'
                  ? `Listo: el worker enviará como template "${metaTemplateName}" con ${metaParamOrder.length} parámetro(s).`
                  : hsmEdit === 'Pendiente'
                  ? 'Pendiente de aprobación en Meta. El worker usará texto libre hasta que cambies el estado a Aprobada.'
                  : 'Template rechazado por Meta. Corrígelo en Business Manager y vuelve a solicitar aprobación.'
                }
              </div>
            )}
          </div>
        </details>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-gray-600">Texto de la plantilla</label>
            <button
              onClick={onTogglePreview}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
            >
              {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showPreview ? 'Ocultar preview' : 'Vista previa'}
            </button>
          </div>
          <textarea
            value={textoEdit}
            onChange={e => onTextoChange(e.target.value)}
            rows={showPreview ? 6 : 9}
            className="w-full border rounded-lg px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
            placeholder="Escribe el texto de la plantilla..."
          />
        </div>

        {showPreview && previewData && (
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" /> Vista previa — estilo WhatsApp
            </p>
            <WhatsAppBubble
              texto={previewData.texto}
              variablesNoEncontradas={previewData.vars}
            />
          </div>
        )}

        <details className="border border-gray-200 rounded-lg">
          <summary className="px-3 py-2 text-xs font-medium text-gray-600 cursor-pointer hover:bg-gray-50">
            Variables disponibles (clic para insertar)
          </summary>
          <div className="p-3 grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
            {ALL_VARIABLES.map(v => (
              <button
                key={v.variable}
                onClick={() => onInsertVariable(v.variable)}
                className="flex items-start gap-2 text-left px-2 py-1.5 rounded hover:bg-indigo-50 border border-transparent hover:border-indigo-200 transition-colors group"
                title={v.descripcion}
              >
                <Copy className="w-3 h-3 text-indigo-400 mt-0.5 shrink-0 group-hover:text-indigo-600" />
                <div>
                  <span className="text-xs font-mono text-indigo-700">{v.variable}</span>
                  <p className="text-xs text-gray-400 leading-tight">{v.descripcion}</p>
                </div>
              </button>
            ))}
          </div>
        </details>

        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={onRestore}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Restaurar por defecto
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Guardar plantilla
          </button>
        </div>
      </div>
    </div>
  );
}
