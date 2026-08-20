import { useEffect, useState } from 'react';
import { Save, Loader2, CheckCircle2, AlertCircle, Bell, Shield, Phone, ShieldCheck, Ban, MessageSquare, Building2 } from 'lucide-react';
import { settingsService } from '@/services/settingsService';
import { extractApiError } from '@/utils/apiError';
import { usePageTitle } from '@/hooks/usePageTitle';
import { SlaPlansPanel } from '@/components/settings/SlaPlansPanel';
import { CannedResponsesPanel } from '@/components/settings/CannedResponsesPanel';
import { CompanyProfilePanel } from '@/components/settings/CompanyProfilePanel';


function Section({ title, icon, children }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border rounded-xl p-5">
      <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
        {icon} {title}
      </h2>
      {children}
    </div>
  );
}

function Field({ label, help, children }: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {help && <p className="text-xs text-gray-400 mt-1">{help}</p>}
    </div>
  );
}

const INPUT_CLS = "border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-300";

export default function SettingsPage() {
  usePageTitle('Configuración');
  const [slaHoras,  setSlaHoras]  = useState('4');
  const [slaInicio, setSlaInicio] = useState('7');
  const [slaFin,    setSlaFin]    = useState('22');

  const [maxLogin, setMaxLogin] = useState('5');

  const [adminPhone, setAdminPhone] = useState('');

  const [autoSuspendActivo,     setAutoSuspendActivo]     = useState(false);
  const [autoSuspendDiasGracia, setAutoSuspendDiasGracia] = useState('10');

  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    (async () => {
      try {
        const s = await settingsService.get();
        setSlaHoras(String(s.SlaHorasAnticipacion  ?? 4));
        setSlaInicio(String(s.SlaHoraInicioLaboral ?? 7));
        setSlaFin(String(s.SlaHoraFinLaboral       ?? 22));
        setMaxLogin(String(s.MaxFailedLoginAttempts ?? 5));
        setAdminPhone(s.AdminPhoneNumber ?? '');
        setAutoSuspendActivo(s.AutoSuspendActivo ?? false);
        setAutoSuspendDiasGracia(String(s.AutoSuspendDiasGracia ?? 10));
      } catch {
        setError('No se pudo cargar la configuración actual.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true); setSaved(false); setError('');
    try {
      await settingsService.save({
        SlaHorasAnticipacion:   parseInt(slaHoras,  10),
        SlaHoraInicioLaboral:   parseInt(slaInicio, 10),
        SlaHoraFinLaboral:      parseInt(slaFin,    10),
        MaxFailedLoginAttempts: parseInt(maxLogin,  10),
        AdminPhoneNumber:       adminPhone.trim(),
        AutoSuspendActivo:      autoSuspendActivo,
        AutoSuspendDiasGracia:  parseInt(autoSuspendDiasGracia, 10) || 10,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      setError(extractApiError(e, 'No se pudo guardar. Verifica los valores.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">

      {}
      <div className="mb-6">
        <h1 className="text-xl font-medium text-gray-900">Configuración</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Parámetros generales del sistema TelecomBoliviaNet
        </p>
      </div>

      {}
      {error && !saving && (
        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {}
      <Section
        title="Datos de la empresa — membrete de los reportes"
        icon={<Building2 className="w-4 h-4 text-blue-600" />}
      >
        <CompanyProfilePanel />
      </Section>

      {}
      <Section title="Alertas SLA — notificaciones al técnico" icon={<Bell className="w-4 h-4 text-blue-600" />}>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          Estos valores controlan <strong>cuándo se envían los WhatsApps de alerta</strong> al técnico
          cuando un ticket está por vencer. No afectan el cálculo del plazo SLA (eso se configura
          en Configuración → Planes SLA).
        </p>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Anticipación de alerta (horas)" help="Enviar alerta N horas antes del vencimiento">
            <input
              type="number" min={1} max={24} value={slaHoras}
              onChange={e => setSlaHoras(e.target.value)}
              className={INPUT_CLS}
            />
          </Field>
          <Field label="Inicio ventana de envío" help="No enviar alertas antes de esta hora (formato 24h)">
            <input
              type="number" min={0} max={23} value={slaInicio}
              onChange={e => setSlaInicio(e.target.value)}
              className={INPUT_CLS}
            />
          </Field>
          <Field label="Fin ventana de envío" help="No enviar alertas después de esta hora (formato 24h)">
            <input
              type="number" min={0} max={23} value={slaFin}
              onChange={e => setSlaFin(e.target.value)}
              className={INPUT_CLS}
            />
          </Field>
        </div>
      </Section>

      {}
      <Section title="Notificaciones al administrador" icon={<Phone className="w-4 h-4 text-green-600" />}>
        <Field
          label="Teléfono WhatsApp del administrador"
          help="Número de 8 dígitos sin prefijo de país (ej: 70000000). Recibe alertas de vencimiento de QR."
        >
          <input
            type="text"
            inputMode="numeric"
            maxLength={15}
            value={adminPhone}
            onChange={e => setAdminPhone(e.target.value.replace(/\D/g, ''))}
            placeholder="70000000"
            className={INPUT_CLS}
          />
        </Field>
      </Section>

      {}
      <Section title="Suspensión automática por deuda" icon={<Ban className="w-4 h-4 text-orange-600" />}>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          Cuando está activo, el sistema suspende automáticamente cada día a las 09:30 (Bolivia)
          los clientes con facturas overdue más del número de días de gracia configurado.
          Máximo 20 suspensiones por ejecución.
        </p>
        <div className="flex items-center gap-4 mb-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoSuspendActivo}
              onChange={e => setAutoSuspendActivo(e.target.checked)}
              className="w-4 h-4 accent-orange-600"
            />
            <span className="text-sm text-gray-700">Activar suspensión automática</span>
          </label>
        </div>
        <Field label="Días de gracia tras el vencimiento" help="Suspender clientes con deuda vencida hace más de N días">
          <input
            type="number" min={1} max={90} value={autoSuspendDiasGracia}
            onChange={e => setAutoSuspendDiasGracia(e.target.value)}
            disabled={!autoSuspendActivo}
            className={`${INPUT_CLS} w-24 ${!autoSuspendActivo ? 'opacity-50' : ''}`}
          />
        </Field>
      </Section>

      {}
      <Section title="Planes SLA — plazos por prioridad" icon={<ShieldCheck className="w-4 h-4 text-blue-600" />}>
        <SlaPlansPanel />
      </Section>

      {}
      <Section title="Plantillas de respuesta rápida" icon={<MessageSquare className="w-4 h-4 text-purple-600" />}>
        <p className="text-xs text-gray-500 mb-3">
          Textos predefinidos que los técnicos pueden insertar en comentarios de tickets con un clic.
        </p>
        <CannedResponsesPanel />
      </Section>

      {}
      <Section title="Seguridad" icon={<Shield className="w-4 h-4 text-red-600" />}>
        <Field label="Intentos de login antes de bloquear cuenta" help="Entre 3 y 10 intentos">
          <input
            type="number" min={3} max={10} value={maxLogin}
            onChange={e => setMaxLogin(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </Field>
      </Section>

      {}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Save className="w-4 h-4" />}
          Guardar configuración
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-green-700">
            <CheckCircle2 className="w-4 h-4" /> Guardado y aplicado correctamente
          </span>
        )}
        {error && saving === false && saved === false && (
          <span className="flex items-center gap-1.5 text-sm text-red-600">
            <AlertCircle className="w-4 h-4" /> {error}
          </span>
        )}
      </div>
    </div>
  );
}
