import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Loader2, AlertCircle, Bell, MessageSquare, Send, CheckCircle2, Filter, Zap,
} from 'lucide-react';
import ConfirmDialog, { type ConfirmState, CONFIRM_CLOSED } from '@/components/shared/ConfirmDialog';
import {
  getNotifConfigs, updateNotifConfigs,
  getPlantillas, updatePlantilla, restorePlantilla,
  getSegments, createSegment, updateSegment, deleteSegment, previewSegment,
  bulkSend, previewPlantilla,
  NOTIF_TYPE_LABELS,
  type NotifConfigDto, type NotifTemplateDto, type NotifType,
  type TemplateCategory, type HsmStatus,
  type NotifSegmentDto,
} from '@/services/notificationService';
import { TriggersTab } from '@/components/settings/notifications/TriggersTab';
import { PlantillasTab } from '@/components/settings/notifications/PlantillasTab';
import {
  SegmentosTab, newSegmentForm, type SegmentFormState,
} from '@/components/settings/notifications/SegmentosTab';
import { EnvioTab, type BulkSendResult } from '@/components/settings/notifications/EnvioTab';

type Tab = 'triggers' | 'plantillas' | 'segmentos' | 'envio';

export default function NotificationsConfigPage() {
  const [activeTab, setActiveTab] = useState<Tab>('triggers');
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [success, setSuccess]     = useState<string | null>(null);
  const [confirmDialog,  setConfirmDialog]  = useState<ConfirmState>(CONFIRM_CLOSED);
  const [confirmRunning, setConfirmRunning] = useState(false);
  const closeConfirm = () => { setConfirmDialog(CONFIRM_CLOSED); setConfirmRunning(false); };

  const [configs, setConfigs]       = useState<NotifConfigDto[]>([]);
  const [horaServer, setHoraServer] = useState('');
  const [expandedTrigger, setExpandedTrigger] = useState<NotifType | null>(null);
  const [savingTriggers, setSavingTriggers]   = useState(false);
  const [confirmSuspension, setConfirmSuspension] = useState(false);

  const [plantillas, setPlantillas]   = useState<NotifTemplateDto[]>([]);
  const [selectedTipo, setSelectedTipo] = useState<NotifType>('SUSPENSION');
  const [textoEdit, setTextoEdit]     = useState('');
  const [categoriaEdit, setCategoriaEdit] = useState<TemplateCategory>('General');
  const [hsmEdit, setHsmEdit]         = useState<HsmStatus>('Pendiente');
  const [filterCategoria, setFilterCategoria] = useState<TemplateCategory | ''>('');
  const [filterHsm, setFilterHsm]     = useState<HsmStatus | ''>('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<{ texto: string; vars: string[] } | null>(null);
  const [savingPlantilla, setSavingPlantilla] = useState(false);
  const previewTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [metaTemplateNameEdit, setMetaTemplateNameEdit] = useState('');
  const [metaLanguageCodeEdit, setMetaLanguageCodeEdit] = useState('es');
  const [metaParamOrderEdit, setMetaParamOrderEdit]     = useState<string[]>([]);

  const [segments, setSegments]         = useState<NotifSegmentDto[]>([]);
  const [segmentForm, setSegmentForm]   = useState<SegmentFormState | null>(null);
  const [editSegId, setEditSegId]       = useState<string | null>(null);
  const [segPreviewCount, setSegPreviewCount] = useState<number | null>(null);
  const [savingSegment, setSavingSegment]     = useState(false);

  const [envioTipo, setEnvioTipo]         = useState<NotifType>('SUSPENSION');
  const [envioSegId, setEnvioSegId]       = useState<string>('');
  const [envioResult, setEnvioResult]     = useState<BulkSendResult | null>(null);
  const [sendingBulk, setSendingBulk] = useState(false);

  const syncEditorFromPlantilla = (p: NotifTemplateDto | undefined) => {
    if (!p) return;
    setTextoEdit(p.Texto);
    setCategoriaEdit(p.Categoria);
    setHsmEdit(p.HsmStatus);
    setMetaTemplateNameEdit(p.MetaTemplateName ?? '');
    setMetaLanguageCodeEdit(p.MetaLanguageCode ?? 'es');
    try { setMetaParamOrderEdit(p.MetaParamOrder ? JSON.parse(p.MetaParamOrder) : []); }
    catch { setMetaParamOrderEdit([]); }
  };

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [cfgData, pltData, segData] = await Promise.all([
        getNotifConfigs(),
        getPlantillas(),
        getSegments(),
      ]);
      setConfigs(cfgData.Configs);
      setHoraServer(cfgData.HoraServidorLocal);
      setPlantillas(pltData);
      setSegments(segData);
      syncEditorFromPlantilla(pltData.find(p => p.Tipo === selectedTipo));
    } catch {
      setError('Error al cargar la configuración.');
    } finally {
      setLoading(false);
    }
  }, [selectedTipo]);

  const reloadPlantillasAndSegments = useCallback(async () => {
    try {
      const [pltData, segData] = await Promise.all([getPlantillas(), getSegments()]);
      setPlantillas(pltData);
      setSegments(segData);
      syncEditorFromPlantilla(pltData.find(p => p.Tipo === selectedTipo));
    } catch {  }
  }, [selectedTipo]);

  useEffect(() => { loadAll(); }, []);

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleSaveTriggers = async () => {
    setSavingTriggers(true);
    try {
      await updateNotifConfigs(configs, confirmSuspension);
      showSuccess('Triggers actualizados correctamente.');
      setConfirmSuspension(false);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      if (msg?.includes('X-Confirm-Suspension')) {
        setConfirmSuspension(true);
        setError('⚠️ El trigger de Suspensión es crítico. Confirma la desactivación marcando el checkbox y guardando de nuevo.');
      } else {
        setError('Error al guardar triggers.');
      }
    } finally {
      setSavingTriggers(false);
    }
  };

  const updateConfig = (tipo: NotifType, field: keyof NotifConfigDto, value: unknown) => {
    setConfigs(prev => prev.map(c => c.Tipo === tipo ? { ...c, [field]: value } : c));
  };

  const handleSelectTipo = (tipo: NotifType) => {
    setSelectedTipo(tipo);
    syncEditorFromPlantilla(plantillas.find(p => p.Tipo === tipo));
    setPreviewData(null);
  };

  const triggerPreview = (texto: string) => {
    if (previewTimeout.current) clearTimeout(previewTimeout.current);
    previewTimeout.current = setTimeout(async () => {
      try {
        const result = await previewPlantilla(texto);
        setPreviewData({ texto: result.TextoRenderizado, vars: result.VariablesNoEncontradas });
      } catch {  }
    }, 600);
  };

  const handleTextoChange = (val: string) => {
    setTextoEdit(val);
    if (showPreview) triggerPreview(val);
  };

  const handleSavePlantilla = async () => {
    setSavingPlantilla(true);
    try {
      const metaName  = metaTemplateNameEdit.trim() || null;
      const metaLang  = metaLanguageCodeEdit || 'es';
      const metaOrder = metaParamOrderEdit.length > 0 ? JSON.stringify(metaParamOrderEdit) : null;
      await updatePlantilla(selectedTipo, textoEdit, categoriaEdit, hsmEdit, metaName, metaLang, metaOrder);
      setPlantillas(prev => prev.map(p =>
        p.Tipo === selectedTipo
          ? { ...p, Texto: textoEdit, Categoria: categoriaEdit, HsmStatus: hsmEdit,
              MetaTemplateName: metaName, MetaLanguageCode: metaLang, MetaParamOrder: metaOrder }
          : p));
      showSuccess('Plantilla guardada correctamente.');
    } catch { setError('Error al guardar plantilla.'); }
    finally { setSavingPlantilla(false); }
  };

  const addMetaParam    = () => setMetaParamOrderEdit((prev: string[]) => [...prev, '']);
  const removeMetaParam = (i: number) => setMetaParamOrderEdit((prev: string[]) => prev.filter((_: string, idx: number) => idx !== i));
  const updateMetaParam = (i: number, val: string) =>
    setMetaParamOrderEdit((prev: string[]) => prev.map((p: string, idx: number) => idx === i ? val : p));
  const moveMetaParam = (i: number, dir: -1 | 1) => {
    const next = [...metaParamOrderEdit];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setMetaParamOrderEdit(next);
  };

  const handleRestorePlantilla = () => {
    setConfirmDialog({
      open: true, variant: 'warning',
      title: 'Restaurar plantilla',
      message: '¿Restaurar el texto por defecto? Se perderá el texto actual.',
      confirmLabel: 'Restaurar',
      onConfirm: async () => {
        setConfirmRunning(true);
        try {
          await restorePlantilla(selectedTipo);
          await reloadPlantillasAndSegments();
          showSuccess('Plantilla restaurada.');
          closeConfirm();
        } catch { setError('Error al restaurar.'); closeConfirm(); }
      },
    });
  };

  const initNewSegment = () => {
    setEditSegId(null);
    setSegmentForm(newSegmentForm());
    setSegPreviewCount(null);
  };

  const editSegment = (seg: NotifSegmentDto) => {
    setEditSegId(seg.Id);
    setSegmentForm({ Nombre: seg.Nombre, Descripcion: seg.Descripcion ?? '', Reglas: seg.Reglas });
    setSegPreviewCount(seg.ClientesEstimados ?? null);
  };

  const handlePreviewSegment = async () => {
    if (!segmentForm) return;
    try {
      const res = await previewSegment(segmentForm);
      setSegPreviewCount(res.ClientesCoinciden);
    } catch { setError('Error al calcular preview.'); }
  };

  const handleSaveSegment = async () => {
    if (!segmentForm) return;
    if (!segmentForm.Nombre.trim()) { setError('El nombre del segmento es requerido.'); return; }
    setSavingSegment(true);
    try {
      if (editSegId) {
        await updateSegment(editSegId, segmentForm);
      } else {
        await createSegment(segmentForm);
      }
      await reloadPlantillasAndSegments();
      setSegmentForm(null);
      setEditSegId(null);
      showSuccess(editSegId ? 'Segmento actualizado.' : 'Segmento creado.');
    } catch { setError('Error al guardar segmento.'); }
    finally { setSavingSegment(false); }
  };

  const handleDeleteSegment = (id: string, nombre: string) => {
    setConfirmDialog({
      open: true, variant: 'danger',
      title: 'Eliminar segmento',
      message: `¿Eliminar el segmento "${nombre}"?`,
      confirmLabel: 'Eliminar',
      onConfirm: async () => {
        setConfirmRunning(true);
        try {
          await deleteSegment(id);
          setSegments(prev => prev.filter(s => s.Id !== id));
          showSuccess('Segmento eliminado.');
          closeConfirm();
        } catch { setError('Error al eliminar segmento.'); closeConfirm(); }
      },
    });
  };

  const handleBulkSend = () => {
    setConfirmDialog({
      open: true, variant: 'warning',
      title: 'Envío masivo',
      message: `¿Enviar notificación "${NOTIF_TYPE_LABELS[envioTipo]}" al segmento seleccionado?\nEsta acción enviará mensajes WhatsApp a múltiples clientes.`,
      confirmLabel: 'Enviar',
      onConfirm: async () => {
        setConfirmRunning(true);
        setSendingBulk(true);
        setEnvioResult(null);
        try {
          const res = await bulkSend(envioTipo, envioSegId || undefined);
          setEnvioResult(res);
          closeConfirm();
        } catch { setError('Error al iniciar envío masivo.'); closeConfirm(); }
        finally { setSendingBulk(false); }
      },
    });
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-5">
      <div className="flex items-center gap-3">
        <Bell className="w-6 h-6 text-indigo-600" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Notificaciones WhatsApp</h1>
          <p className="text-sm text-gray-500">Hora servidor Bolivia: {horaServer}</p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          <CheckCircle2 className="w-4 h-4" /> {success}
        </div>
      )}

      <div className="flex gap-1 border-b border-gray-200">
        {([
          { key: 'triggers',   label: 'Triggers',   icon: Zap },
          { key: 'plantillas', label: 'Plantillas',  icon: MessageSquare },
          { key: 'segmentos',  label: 'Segmentos',   icon: Filter },
          { key: 'envio',      label: 'Envío Masivo', icon: Send },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === key
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {activeTab === 'triggers' && (
        <TriggersTab
          configs={configs}
          plantillas={plantillas}
          expandedTrigger={expandedTrigger}
          onToggleExpand={setExpandedTrigger}
          confirmSuspension={confirmSuspension}
          onConfirmSuspensionChange={setConfirmSuspension}
          saving={savingTriggers}
          onSave={handleSaveTriggers}
          onUpdateConfig={updateConfig}
        />
      )}

      {activeTab === 'plantillas' && (
        <PlantillasTab
          plantillas={plantillas}
          selectedTipo={selectedTipo}
          onSelectTipo={handleSelectTipo}
          filterCategoria={filterCategoria}
          onFilterCategoria={setFilterCategoria}
          filterHsm={filterHsm}
          onFilterHsm={setFilterHsm}
          textoEdit={textoEdit}
          onTextoChange={handleTextoChange}
          categoriaEdit={categoriaEdit}
          onCategoriaChange={setCategoriaEdit}
          hsmEdit={hsmEdit}
          onHsmChange={setHsmEdit}
          metaTemplateName={metaTemplateNameEdit}
          onMetaTemplateName={setMetaTemplateNameEdit}
          metaLanguageCode={metaLanguageCodeEdit}
          onMetaLanguageCode={setMetaLanguageCodeEdit}
          metaParamOrder={metaParamOrderEdit}
          onAddMetaParam={addMetaParam}
          onRemoveMetaParam={removeMetaParam}
          onUpdateMetaParam={updateMetaParam}
          onMoveMetaParam={moveMetaParam}
          showPreview={showPreview}
          onTogglePreview={() => { setShowPreview(!showPreview); if (!showPreview) triggerPreview(textoEdit); }}
          previewData={previewData}
          onInsertVariable={variable => setTextoEdit(prev => prev + variable)}
          onRestore={handleRestorePlantilla}
          onSave={handleSavePlantilla}
          saving={savingPlantilla}
        />
      )}

      {activeTab === 'segmentos' && (
        <SegmentosTab
          segments={segments}
          segmentForm={segmentForm}
          onFormChange={setSegmentForm}
          editSegId={editSegId}
          onNew={initNewSegment}
          onEdit={editSegment}
          onDelete={handleDeleteSegment}
          onPreview={handlePreviewSegment}
          previewCount={segPreviewCount}
          onSave={handleSaveSegment}
          saving={savingSegment}
          onCancel={() => { setSegmentForm(null); setEditSegId(null); }}
        />
      )}

      {activeTab === 'envio' && (
        <EnvioTab
          plantillas={plantillas}
          segments={segments}
          envioTipo={envioTipo}
          onTipoChange={setEnvioTipo}
          envioSegId={envioSegId}
          onSegChange={setEnvioSegId}
          onSend={handleBulkSend}
          sending={sendingBulk}
          result={envioResult}
        />
      )}

      <ConfirmDialog state={confirmDialog} onClose={closeConfirm} running={confirmRunning} />
    </div>
  );
}
