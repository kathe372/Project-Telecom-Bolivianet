import { useState, useRef, useEffect } from 'react';
import { Search, Loader2, AlertCircle, Save, X, CheckCircle, UserX } from 'lucide-react';
import { ticketService } from '@/services/ticketService';
import { clientService } from '@/services/clientService';
import type { UserSystemDto } from '@/types/auth.types';
import type { ClientListItemDto } from '@/types/client.types';
import { TICKET_TYPES, PRIORITIES } from './ticketHelpers';
import { extractApiError } from '@/utils/apiError';

interface Props {
  technicians: UserSystemDto[];
  onClose:     () => void;
  onCreated:   () => void;
}

export function CreateTicketModal({ technicians, onClose, onCreated }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => { dialogRef.current?.focus(); }, []);

  const [form, setForm] = useState({
    Subject: '', Type: 'SoporteTecnico', Priority: 'Media',
    Description: '', SupportGroup: '', AssignedToUserId: '',
  });

  const [clientMode,      setClientMode]      = useState<'registered' | 'prospect'>('registered');
  const [clientSearch,    setClientSearch]    = useState('');
  const [clientResults,   setClientResults]   = useState<ClientListItemDto[]>([]);
  const [selectedClient,  setSelectedClient]  = useState<ClientListItemDto | null>(null);
  const [prospectName,    setProspectName]    = useState('');
  const [prospectPhone,   setProspectPhone]   = useState('');
  const [prospectCi,      setProspectCi]      = useState('');
  const [searching,       setSearching]       = useState(false);
  const [saving,          setSaving]          = useState(false);
  const [error,           setError]           = useState('');
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleClientModeChange = (mode: 'registered' | 'prospect') => {
    setClientMode(mode);
    setSelectedClient(null);
    setClientSearch('');
    setClientResults([]);
    setProspectName('');
    setProspectPhone('');
    setProspectCi('');
    setError('');
  };

  const handleClientSearch = (val: string) => {
    setClientSearch(val);
    setSelectedClient(null);
    if (searchRef.current) clearTimeout(searchRef.current);
    if (val.trim().length < 2) { setClientResults([]); return; }
    searchRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await clientService.getAll({ Search: val, PageSize: 8 });
        setClientResults(res.Items ?? []);
      } catch {
        setClientResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  };

  const selectClient = (c: ClientListItemDto) => {
    setSelectedClient(c);
    setClientSearch(c.FullName);
    setClientResults([]);
  };

  const handleSubmit = async () => {
    if (clientMode === 'registered' && !selectedClient) {
      setError('Selecciona un cliente de la lista.'); return;
    }
    if (clientMode === 'prospect' && !prospectName.trim()) {
      setError('El nombre del prospecto es obligatorio.'); return;
    }
    if (clientMode === 'prospect' && !prospectCi.trim()) {
      setError('La cédula de identidad del prospecto es obligatoria.'); return;
    }
    if (!form.Subject.trim())     { setError('El asunto es obligatorio.'); return; }
    if (!form.Description.trim()) { setError('La descripción es obligatoria.'); return; }
    setSaving(true); setError('');
    try {
      await ticketService.create({
        ...(clientMode === 'registered'
          ? { ClientId: selectedClient!.Id }
          : {
              ProspectName:         prospectName.trim(),
              ProspectPhone:        prospectPhone.trim() || undefined,
              ProspectIdentityCard: prospectCi.trim(),
            }),
        Subject:          form.Subject.trim(),
        Type:             form.Type,
        Priority:         form.Priority,
        Description:      form.Description.trim(),
        SupportGroup:     form.SupportGroup.trim() || undefined,
        AssignedToUserId: form.AssignedToUserId || undefined,
      });
      onCreated(); onClose();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Error al crear el ticket.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="create-ticket-modal-title" tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }} className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] flex flex-col outline-none">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 shrink-0">
          <h2 id="create-ticket-modal-title" className="text-lg font-bold text-gray-900">Nuevo Ticket</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">

          {}
          <div>
            <label className="label">Tipo de solicitante *</label>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
              <button
                type="button"
                onClick={() => handleClientModeChange('registered')}
                className={`flex-1 py-2 px-3 flex items-center justify-center gap-1.5 transition-colors ${clientMode === 'registered' ? 'bg-blue-600 text-white font-medium' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                <Search className="w-3.5 h-3.5" /> Cliente registrado
              </button>
              <button
                type="button"
                onClick={() => handleClientModeChange('prospect')}
                className={`flex-1 py-2 px-3 flex items-center justify-center gap-1.5 transition-colors ${clientMode === 'prospect' ? 'bg-blue-600 text-white font-medium' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                <UserX className="w-3.5 h-3.5" /> Prospecto / sin cuenta
              </button>
            </div>
          </div>

          {}
          {clientMode === 'registered' && (
            <div className="relative">
              <label className="label">Cliente *</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input className="input-field pl-9" placeholder="Busca por nombre, TBN o cédula..."
                  value={clientSearch} onChange={e => handleClientSearch(e.target.value)} />
                {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />}
              </div>
              {clientResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {clientResults.map(c => (
                    <button key={c.Id} onClick={() => selectClient(c)}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 border-b border-gray-50 last:border-0">
                      <span className="font-medium text-gray-800">{c.FullName}</span>
                      <span className="text-gray-400 ml-2">{c.TbnCode}</span>
                    </button>
                  ))}
                </div>
              )}
              {selectedClient && (
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> {selectedClient.FullName} ({selectedClient.TbnCode})
                </p>
              )}
            </div>
          )}

          {}
          {clientMode === 'prospect' && (
            <div className="space-y-3">
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                El ticket quedará sin cliente asociado. Podrás vincularlo a un cliente después desde el detalle del ticket.
              </div>
              <div>
                <label className="label">Nombre del prospecto *</label>
                <input className="input-field" maxLength={200} placeholder="Nombre completo..."
                  value={prospectName} onChange={e => setProspectName(e.target.value)} />
              </div>
              <div>
                <label className="label">Teléfono <span className="text-gray-400 font-normal">opt.</span></label>
                <input className="input-field" maxLength={30} placeholder="ej: 70000000"
                  value={prospectPhone}
                  onChange={e => setProspectPhone(e.target.value.replace(/[^0-9+\-\s]/g, ''))} />
              </div>
              <div>
                <label className="label">Cédula de identidad *</label>
                <input className="input-field" maxLength={30} placeholder="ej: 12345678"
                  value={prospectCi}
                  onChange={e => setProspectCi(e.target.value)} />
                <p className="text-xs text-gray-400 mt-1">
                  Necesaria para dejar registrada la identidad de quien solicita la visita.
                </p>
              </div>
            </div>
          )}

          <div>
            <label className="label">Asunto *</label>
            <input className="input-field" maxLength={200} placeholder="Resumen breve del problema..."
              value={form.Subject} onChange={e => set('Subject', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Tipo *</label>
              <select className="input-field" value={form.Type} onChange={e => set('Type', e.target.value)}>
                {Object.entries(TICKET_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Prioridad *</label>
              <select className="input-field" value={form.Priority} onChange={e => set('Priority', e.target.value)}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Grupo de soporte</label>
            <input className="input-field" placeholder="ej: Nivel 1, Fibra, Administrativo..." maxLength={100}
              value={form.SupportGroup} onChange={e => set('SupportGroup', e.target.value)} />
          </div>

          <div>
            <label className="label">Descripción *</label>
            <textarea className="input-field resize-none" rows={3} maxLength={1000}
              placeholder="Describe el problema o solicitud..."
              value={form.Description} onChange={e => set('Description', e.target.value)} />
            <p className="text-xs text-gray-400 text-right mt-0.5">{form.Description.length}/1000</p>
          </div>

          <div>
            <label className="label">Asignar a técnico</label>
            <select className="input-field" value={form.AssignedToUserId} onChange={e => set('AssignedToUserId', e.target.value)}>
              <option value="">— Sin asignar —</option>
              {technicians.map(t => <option key={t.Id} value={t.Id}>{t.FullName}</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              El SLA se calculará automáticamente según la prioridad seleccionada.
            </p>
          </div>

          {error && <p className="text-sm text-red-600 flex items-center gap-1.5"><AlertCircle className="w-4 h-4" />{error}</p>}

          <div className="flex gap-2 justify-end pt-2">
            <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
            <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Crear Ticket
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
