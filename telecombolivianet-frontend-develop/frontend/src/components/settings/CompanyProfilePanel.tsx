import { useEffect, useRef, useState } from 'react';
import { Save, Loader2, CheckCircle2, AlertCircle, Upload, Trash2 } from 'lucide-react';
import { companyProfileService, type CompanyProfileDto } from '@/services/companyProfileService';
import { extractApiError } from '@/utils/apiError';

/** Un logo más pesado que esto se incrusta en cada PDF y los vuelve lentos de abrir. */
const MAX_LOGO_BYTES = 500 * 1024;

const INPUT_CLS =
  'border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-300';

function Field({ label, help, children }: {
  label: string; help?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {help && <p className="text-xs text-gray-400 mt-1">{help}</p>}
    </div>
  );
}

/**
 * Datos que encabezan todos los reportes exportados. Antes estaban escritos en el
 * código del backend, así que corregir el NIT exigía un despliegue.
 */
export function CompanyProfilePanel() {
  const [profile, setProfile] = useState<CompanyProfileDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    companyProfileService.get()
      .then(setProfile)
      .catch(() => setError('No se pudo cargar el perfil de la empresa.'))
      .finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof CompanyProfileDto>(key: K, value: CompanyProfileDto[K]) => {
    setProfile(p => (p ? { ...p, [key]: value } : p));
    setSaved(false);
  };

  const handleLogo = (file: File) => {
    setError('');
    if (file.size > MAX_LOGO_BYTES) {
      setError('El logo debe pesar menos de 500 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      // El backend guarda solo la carga útil; el prefijo data: lo agrega el visor.
      set('LogoBase64', result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true); setError(''); setSaved(false);
    try {
      setProfile(await companyProfileService.save(profile));
      setSaved(true);
    } catch (e: unknown) {
      setError(extractApiError(e, 'No se pudo guardar el perfil de la empresa.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando perfil...
      </div>
    );
  }

  if (!profile) {
    return (
      <p className="text-sm text-red-600 flex items-center gap-1.5">
        <AlertCircle className="w-4 h-4" /> {error || 'Perfil no disponible.'}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Estos datos encabezan todos los reportes que se exportan a PDF, Excel y CSV.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Nombre comercial">
          <input className={INPUT_CLS} value={profile.Name}
            onChange={e => set('Name', e.target.value)} />
        </Field>
        <Field label="Razón social" help="Aparece en el pie legal del documento">
          <input className={INPUT_CLS} value={profile.LegalName ?? ''}
            onChange={e => set('LegalName', e.target.value)} />
        </Field>
        <Field label="NIT">
          <input className={INPUT_CLS} value={profile.Nit ?? ''}
            onChange={e => set('Nit', e.target.value)} />
        </Field>
        <Field label="Descripción bajo el nombre">
          <input className={INPUT_CLS} value={profile.Tagline ?? ''}
            placeholder="Proveedor de Servicios de Internet"
            onChange={e => set('Tagline', e.target.value)} />
        </Field>
        <Field label="Dirección">
          <input className={INPUT_CLS} value={profile.Address ?? ''}
            onChange={e => set('Address', e.target.value)} />
        </Field>
        <Field label="Ciudad">
          <input className={INPUT_CLS} value={profile.City ?? ''}
            onChange={e => set('City', e.target.value)} />
        </Field>
        <Field label="Teléfono">
          <input className={INPUT_CLS} value={profile.Phone ?? ''}
            onChange={e => set('Phone', e.target.value)} />
        </Field>
        <Field label="Correo">
          <input className={INPUT_CLS} value={profile.Email ?? ''}
            onChange={e => set('Email', e.target.value)} />
        </Field>
        <Field label="Sitio web">
          <input className={INPUT_CLS} value={profile.Website ?? ''}
            onChange={e => set('Website', e.target.value)} />
        </Field>
        <Field label="Color de marca" help="Tiñe cabeceras y acentos de los reportes">
          <div className="flex items-center gap-2">
            <input type="color" className="h-9 w-12 border rounded cursor-pointer"
              value={profile.PrimaryColor}
              onChange={e => set('PrimaryColor', e.target.value)} />
            <input className={INPUT_CLS} value={profile.PrimaryColor}
              onChange={e => set('PrimaryColor', e.target.value)} />
          </div>
        </Field>
      </div>

      <Field label="Leyenda del pie de página">
        <input className={INPUT_CLS} value={profile.FooterLegal ?? ''}
          onChange={e => set('FooterLegal', e.target.value)} />
      </Field>

      <Field label="Logo" help="PNG o JPG, menos de 500 KB. Opcional.">
        <div className="flex items-center gap-3">
          {profile.LogoBase64 ? (
            <img
              src={`data:image/png;base64,${profile.LogoBase64}`}
              alt="Logo de la empresa"
              className="h-12 w-auto border rounded bg-white p-1"
            />
          ) : (
            <span className="text-xs text-gray-400">Sin logo cargado</span>
          )}

          <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleLogo(f); }} />

          <button type="button" onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 hover:bg-gray-50">
            <Upload className="w-3.5 h-3.5" /> Subir
          </button>

          {profile.LogoBase64 && (
            <button type="button" onClick={() => set('LogoBase64', null)}
              className="flex items-center gap-1.5 text-xs text-red-600 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50">
              <Trash2 className="w-3.5 h-3.5" /> Quitar
            </button>
          )}
        </div>
      </Field>

      <div className="flex items-center gap-3 pt-1">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar datos de la empresa
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-green-700">
            <CheckCircle2 className="w-4 h-4" /> Guardado
          </span>
        )}
        {error && (
          <span className="flex items-center gap-1.5 text-sm text-red-600">
            <AlertCircle className="w-4 h-4" /> {error}
          </span>
        )}
      </div>
    </div>
  );
}
