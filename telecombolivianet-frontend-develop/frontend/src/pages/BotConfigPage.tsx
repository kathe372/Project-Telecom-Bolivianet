import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Save, RotateCcw, Loader2, AlertCircle, CheckCircle2, Bot,
} from 'lucide-react';
import {
  chatbotService,
  type BotConfigDto, type RagDocumentDto,
} from '@/services/chatbotService';
import api from '@/services/api';
import ConfirmDialog, { type ConfirmState, CONFIRM_CLOSED } from '@/components/shared/ConfirmDialog';
import { MenuTab } from '@/components/settings/bot/MenuTab';
import { HorarioTab } from '@/components/settings/bot/HorarioTab';
import { MensajesTab } from '@/components/settings/bot/MensajesTab';
import { QrTab, type CompanyQrInfo } from '@/components/settings/bot/QrTab';
import { RagTab } from '@/components/settings/bot/RagTab';

type Tab = 'menu' | 'horario' | 'mensajes' | 'qr' | 'rag';

const CONFIG_TABS: { key: Tab; label: string }[] = [
  { key: 'menu',     label: 'Menú principal' },
  { key: 'horario',  label: 'Horario' },
  { key: 'mensajes', label: 'Mensajes' },
  { key: 'qr',       label: 'QR de pago' },
  { key: 'rag',      label: 'Documentos IA' },
];

export default function BotConfigPage() {
  const [config, setConfig]   = useState<BotConfigDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab]         = useState<Tab>('menu');
  const [confirmDialog,  setConfirmDialog]  = useState<ConfirmState>(CONFIRM_CLOSED);
  const [confirmRunning, setConfirmRunning] = useState(false);

  const [qrInfo,      setQrInfo]      = useState<CompanyQrInfo | null>(null);
  const [qrLoading,   setQrLoading]   = useState(false);
  const [qrUploading, setQrUploading] = useState(false);
  const [qrBlobUrl,   setQrBlobUrl]   = useState<string | null>(null);
  const [qrExpiresAt, setQrExpiresAt] = useState('');
  const qrInputRef = useRef<HTMLInputElement>(null);

  const [ragDocs,      setRagDocs]      = useState<RagDocumentDto[]>([]);
  const [ragLoading,   setRagLoading]   = useState(false);
  const [ragUploading, setRagUploading] = useState(false);
  const [ragTitle,     setRagTitle]     = useState('');
  const ragInputRef = useRef<HTMLInputElement>(null);

  const closeConfirm = () => { setConfirmDialog(CONFIRM_CLOSED); setConfirmRunning(false); };

  const load = useCallback(async () => {
    setLoading(true);
    try { setConfig(await chatbotService.getBotConfig()); }
    catch { setError('Error al cargar la configuración.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadQr = useCallback(async () => {
    setQrLoading(true);
    try {
      const info = await chatbotService.getCompanyQrInfo();
      setQrInfo(info);
      if (info.HasQr) {
        const res = await api.get('/bot-config/company-qr', { responseType: 'blob' });
        const url = URL.createObjectURL(res.data as Blob);
        setQrBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
      } else {
        setQrBlobUrl(null);
      }
    } catch { setError('Error al cargar info del QR.'); }
    finally { setQrLoading(false); }
  }, []);

  const loadRag = useCallback(async () => {
    setRagLoading(true);
    try { setRagDocs(await chatbotService.ragListDocuments()); }
    catch { setError('Error al cargar documentos.'); }
    finally { setRagLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === 'qr')  loadQr();
    if (tab === 'rag') loadRag();
  }, [tab, loadQr, loadRag]);

  useEffect(() => () => { if (qrBlobUrl) URL.revokeObjectURL(qrBlobUrl); }, []);

  const handleSave = async () => {
    if (!config) return;

    if (tab === 'menu') {
      const activas = config.Menu.Opciones.filter(o => o.Activa);
      if (activas.length === 0) {
        setError('Debe haber al menos una opción activa en el menú.');
        return;
      }
      const tituloLargo = config.Menu.Opciones.find(o => o.Etiqueta.length > 24);
      if (tituloLargo) {
        setError(`La etiqueta "${tituloLargo.Etiqueta}" supera los 24 caracteres permitidos por WhatsApp.`);
        return;
      }
      const descLarga = config.Menu.Opciones.find(o => (o.Descripcion?.length ?? 0) > 72);
      if (descLarga) {
        setError(`La descripción de "${descLarga.Etiqueta}" supera los 72 caracteres permitidos por WhatsApp.`);
        return;
      }
    }

    setSaving(true); setError(null);
    try {
      const saved = await chatbotService.updateBotConfig(config);
      setConfig(saved);
      setSuccess('Configuración guardada correctamente.');
      setTimeout(() => setSuccess(null), 3000);
    } catch { setError('Error al guardar.'); }
    finally { setSaving(false); }
  };

  const handleReset = () => {
    setConfirmDialog({
      open: true, variant: 'warning',
      title: 'Restaurar configuración',
      message: '¿Restaurar la configuración por defecto? Se perderá la configuración actual.',
      confirmLabel: 'Restaurar',
      onConfirm: async () => {
        setConfirmRunning(true);
        try {
          const def = await chatbotService.resetBotConfig();
          setConfig(def);
          setSuccess('Configuración restaurada.');
          setTimeout(() => setSuccess(null), 3000);
          closeConfirm();
        } catch { setError('Error al restaurar.'); closeConfirm(); }
      },
    });
  };

  const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!qrExpiresAt) {
      setError('Debes ingresar la fecha de vencimiento del QR antes de subirlo.');
      if (qrInputRef.current) qrInputRef.current.value = '';
      return;
    }
    setQrUploading(true); setError(null);
    try {
      await chatbotService.uploadCompanyQr(file, qrExpiresAt);
      setSuccess('QR de pago actualizado correctamente.');
      setQrExpiresAt('');
      setTimeout(() => setSuccess(null), 3000);
      await loadQr();
    } catch { setError('Error al subir el QR. Verifica el formato y tamaño.'); }
    finally { setQrUploading(false); if (qrInputRef.current) qrInputRef.current.value = ''; }
  };

  const handleRagUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ragTitle.trim()) {
      setError('El título es obligatorio para indexar el documento.');
      if (ragInputRef.current) ragInputRef.current.value = '';
      return;
    }
    setRagUploading(true); setError(null);
    try {
      await chatbotService.ragUploadDocument(file, ragTitle.trim());
      setSuccess('Documento subido. Indexando chunks en segundo plano...');
      setRagTitle('');
      await loadRag();
      setTimeout(async () => {
        await loadRag();
        setSuccess(prev => prev ? 'Documento subido e indexado correctamente.' : prev);
        setTimeout(() => setSuccess(null), 3000);
      }, 8000);
    } catch { setError('Error al subir el documento.'); }
    finally { setRagUploading(false); if (ragInputRef.current) ragInputRef.current.value = ''; }
  };

  const handleRagDelete = (id: string, fileName: string) => {
    setConfirmDialog({
      open: true, variant: 'danger',
      title: 'Eliminar documento',
      message: `¿Eliminar "${fileName}"? Los chunks vectorizados de este documento también se eliminarán.`,
      confirmLabel: 'Eliminar',
      onConfirm: async () => {
        setConfirmRunning(true);
        try {
          await chatbotService.ragDeleteDocument(id);
          setRagDocs(prev => prev.filter(d => d.id !== id));
          setSuccess('Documento eliminado.');
          setTimeout(() => setSuccess(null), 3000);
          closeConfirm();
        } catch { setError('Error al eliminar documento.'); closeConfirm(); }
      },
    });
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
    </div>
  );

  // Fix auditoría: antes, si la carga fallaba (config=null) el spinner quedaba
  // para siempre y el banner de error era inalcanzable.
  if (!config) return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
        <AlertCircle className="w-4 h-4 shrink-0" /> {error ?? 'Error al cargar la configuración.'}
      </div>
    </div>
  );

  const isConfigTab = ['menu', 'horario', 'mensajes'].includes(tab);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-5">
      <div className="flex items-center gap-3">
        <Bot className="w-6 h-6 text-green-600" />
        <h1 className="text-xl font-bold text-gray-900">Configuración del Bot WhatsApp</h1>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto">✕</button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          <CheckCircle2 className="w-4 h-4 shrink-0" /> {success}
        </div>
      )}

      <div className="flex gap-1 border-b border-gray-200 flex-wrap">
        {CONFIG_TABS.map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === key ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'menu' && <MenuTab config={config} onChange={setConfig} />}
      {tab === 'horario' && <HorarioTab config={config} onChange={setConfig} />}
      {tab === 'mensajes' && <MensajesTab config={config} onChange={setConfig} />}

      {tab === 'qr' && (
        <QrTab
          qrInfo={qrInfo}
          loading={qrLoading}
          uploading={qrUploading}
          blobUrl={qrBlobUrl}
          expiresAt={qrExpiresAt}
          onExpiresAtChange={setQrExpiresAt}
          onFileChange={handleQrUpload}
          onMissingExpiry={() => setError('Debes ingresar la fecha de vencimiento del QR antes de seleccionar el archivo.')}
          inputRef={qrInputRef}
        />
      )}

      {tab === 'rag' && (
        <RagTab
          docs={ragDocs}
          loading={ragLoading}
          uploading={ragUploading}
          title={ragTitle}
          onTitleChange={setRagTitle}
          onFileChange={handleRagUpload}
          onDelete={handleRagDelete}
          inputRef={ragInputRef}
        />
      )}

      {isConfigTab && (
        <div className="flex items-center gap-3 justify-end pt-2 border-t border-gray-100">
          <button onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
            <RotateCcw className="w-3.5 h-3.5" /> Restaurar defecto
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Guardar configuración
          </button>
        </div>
      )}

      <ConfirmDialog state={confirmDialog} onClose={closeConfirm} running={confirmRunning} />
    </div>
  );
}
