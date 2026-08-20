import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { createInstallation } from '@/services/installationService';
import { planService, searchClients } from '@/services/clientService';
import type { PlanDto, ClientListItemDto } from '@/types/client.types';
import SlotPicker from '@/components/installations/SlotPicker';

export function NewInstallationModal({
  onClose,
  onDone,
  defaultFecha,
  defaultHora,
  defaultTecnicoId,
}: {
  onClose: () => void;
  onDone: () => void;
  // Pre-rellenado al crear desde el calendario (clic en hueco / columna de técnico).
  // Opcionales: sin ellos el modal funciona igual que antes.
  defaultFecha?: string;
  defaultHora?: string;
  defaultTecnicoId?: string;
}) {
  const [planes, setPlanes] = useState<PlanDto[]>([]);
  const [clienteQuery, setClienteQuery] = useState('');
  const [clienteResultados, setClienteResultados] = useState<ClientListItemDto[]>([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<ClientListItemDto | null>(null);
  const [buscandoCliente, setBuscandoCliente] = useState(false);

  const [form, setForm] = useState({
    PlanId: '',
    Fecha: defaultFecha ?? '',
    HoraInicio: defaultHora ?? '',
    DuracionMin: 120,
    Direccion: '',
    Notas: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    planService.getAll(true).then(setPlanes).catch(() => {});
  }, []);

  const buscarClientes = async () => {
    if (!clienteQuery.trim()) return;
    setBuscandoCliente(true);
    try {
      const res = await searchClients({ Query: clienteQuery, PageSize: 5 });
      setClienteResultados(res.Items);
    } catch {
      setClienteResultados([]);
    } finally {
      setBuscandoCliente(false);
    }
  };

  const handleSubmit = async () => {
    if (!clienteSeleccionado) { setError('Selecciona un cliente.'); return; }
    if (!form.PlanId)          { setError('Selecciona un plan.'); return; }
    if (!form.Fecha)            { setError('Ingresa la fecha.'); return; }
    if (!form.HoraInicio)       { setError('Ingresa la hora de inicio.'); return; }
    if (!form.Direccion.trim()) { setError('Ingresa la dirección.'); return; }

    setLoading(true);
    setError('');
    try {
      await createInstallation({
        ClienteId:  clienteSeleccionado.Id,
        PlanId:     form.PlanId,
        Fecha:      form.Fecha,
        HoraInicio: form.HoraInicio,
        DuracionMin: form.DuracionMin,
        Direccion:  form.Direccion,
        Notas:      form.Notas || undefined,
        ...(defaultTecnicoId ? { TecnicoId: defaultTecnicoId } : {}),
      });
      onDone();
    } catch {
      setError('Error al crear la instalación. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-medium text-gray-900">Nueva instalación</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
          {clienteSeleccionado ? (
            <div className="flex items-center justify-between border rounded-lg px-3 py-2 bg-blue-50">
              <span className="text-sm text-blue-900 font-medium">
                {clienteSeleccionado.TbnCode} — {clienteSeleccionado.FullName}
              </span>
              <button
                onClick={() => { setClienteSeleccionado(null); setClienteResultados([]); setClienteQuery(''); }}
                className="text-xs text-gray-400 hover:text-gray-700 ml-2"
              >
                ✕
              </button>
            </div>
          ) : (
            <div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Buscar por nombre o TBN..."
                  value={clienteQuery}
                  onChange={(e) => setClienteQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && buscarClientes()}
                  className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <button
                  onClick={buscarClientes}
                  disabled={buscandoCliente}
                  className="px-3 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 flex items-center gap-1"
                >
                  {buscandoCliente ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buscar'}
                </button>
              </div>
              {clienteResultados.length > 0 && (
                <ul className="border rounded-lg mt-1 divide-y text-sm max-h-36 overflow-y-auto">
                  {clienteResultados.map((c) => (
                    <li
                      key={c.Id}
                      onClick={() => { setClienteSeleccionado(c); setClienteResultados([]); }}
                      className="px-3 py-2 hover:bg-blue-50 cursor-pointer"
                    >
                      <span className="font-medium">{c.TbnCode}</span> — {c.FullName}
                      <span className="text-gray-400 text-xs ml-2">({c.PlanName})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
          <select
            value={form.PlanId}
            onChange={(e) => setForm({ ...form, PlanId: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <option value="">Seleccionar plan...</option>
            {planes.map((p) => (
              <option key={p.Id} value={p.Id}>
                {p.Name} — {p.SpeedMb} Mb — Bs. {p.MonthlyPrice}
              </option>
            ))}
          </select>
        </div>

        {form.PlanId && (
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Franjas disponibles</label>
            <SlotPicker
              planId={form.PlanId}
              selected={{ fecha: form.Fecha, horaInicio: form.HoraInicio }}
              onPick={(fecha, horaInicio) => setForm({ ...form, Fecha: fecha, HoraInicio: horaInicio })}
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
            <input
              type="date"
              value={form.Fecha}
              onChange={(e) => setForm({ ...form, Fecha: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hora inicio</label>
            <input
              type="time"
              value={form.HoraInicio}
              onChange={(e) => setForm({ ...form, HoraInicio: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Duración (min)</label>
            <input
              type="number"
              min={30}
              max={480}
              value={form.DuracionMin}
              onChange={(e) => setForm({ ...form, DuracionMin: Number(e.target.value) })}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
            <input
              type="text"
              placeholder="Av. / Calle..."
              value={form.Direccion}
              onChange={(e) => setForm({ ...form, Direccion: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
          <textarea
            rows={2}
            placeholder="Observaciones adicionales..."
            value={form.Notas}
            onChange={(e) => setForm({ ...form, Notas: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <Loader2 className="w-3 h-3 animate-spin" />}
            Crear instalación
          </button>
        </div>
      </div>
    </div>
  );
}
