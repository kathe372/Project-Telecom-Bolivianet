import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  getClientHistorial,
  type ClientActivityItemDto, type ClientHistoryDto,
} from '@/services/clientService';

const HISTORY_TYPE_OPTIONS = [
  { value: '',            label: 'Todos' },
  { value: 'Pago',        label: 'Pagos' },
  { value: 'Factura',     label: 'Facturas' },
  { value: 'Ticket',      label: 'Tickets' },
  { value: 'Notif',       label: 'Notificaciones' },
  { value: 'Estado',      label: 'Cambios de estado' },
  { value: 'Admin',       label: 'Acciones admin' },
  { value: 'Adjunto',     label: 'Documentos' },
  { value: 'CambioPlan',  label: 'Cambios de plan' },
];

const TIPO_COLORS: Record<string, string> = {
  Pago:       'bg-green-100 text-green-700',
  Factura:    'bg-blue-100 text-blue-700',
  Ticket:     'bg-orange-100 text-orange-700',
  Notif:      'bg-purple-100 text-purple-700',
  Estado:     'bg-amber-100 text-amber-700',
  Admin:      'bg-gray-100 text-gray-600',
  Adjunto:    'bg-indigo-100 text-indigo-700',
  CambioPlan: 'bg-cyan-100 text-cyan-700',
};

export function HistoryTab({ clientId }: { clientId: string }) {
  const [data, setData]       = useState<ClientHistoryDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(1);
  const [tipo, setTipo]       = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getClientHistorial(clientId, page, 25, tipo || undefined));
    } catch {  }
    finally { setLoading(false); }
  }, [clientId, page, tipo]);

  useEffect(() => { load(); }, [load]);

  const fmtDate = (d: string) => new Date(d).toLocaleString('es-BO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const totalPages = data ? Math.ceil(data.Total / 25) : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {HISTORY_TYPE_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => { setTipo(opt.value); setPage(1); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
              tipo === opt.value
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card p-8 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
        </div>
      ) : !data || data.Items.length === 0 ? (
        <div className="card p-8 text-center text-gray-400 text-sm">
          No hay actividad registrada{tipo ? ` para el tipo "${tipo}"` : ''}.
        </div>
      ) : (
        <>
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
            <div className="space-y-3 pl-10">
              {data.Items.map((item: ClientActivityItemDto) => (
                <div key={item.Id} className="relative">
                  <div className={`absolute -left-6 w-3 h-3 rounded-full border-2 border-white mt-1.5 ${
                    TIPO_COLORS[item.Tipo]?.includes('green')   ? 'bg-green-500' :
                    TIPO_COLORS[item.Tipo]?.includes('blue')    ? 'bg-blue-500'  :
                    TIPO_COLORS[item.Tipo]?.includes('orange')  ? 'bg-orange-500':
                    TIPO_COLORS[item.Tipo]?.includes('purple')  ? 'bg-purple-500':
                    TIPO_COLORS[item.Tipo]?.includes('amber')   ? 'bg-amber-500' :
                    TIPO_COLORS[item.Tipo]?.includes('indigo')  ? 'bg-indigo-500':
                    TIPO_COLORS[item.Tipo]?.includes('cyan')    ? 'bg-cyan-500'  :
                    'bg-gray-400'
                  }`} />
                  <div className="card p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TIPO_COLORS[item.Tipo] ?? 'bg-gray-100 text-gray-600'}`}>
                            {item.Tipo}
                          </span>
                          <span className="text-xs text-gray-400">{item.Actor}</span>
                        </div>
                        <p className="text-sm text-gray-800 leading-snug">{item.Descripcion}</p>
                      </div>
                      <span className="text-xs text-gray-400 shrink-0 font-mono">
                        {fmtDate(item.OcurridoAt)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-gray-500">
                {data.Total} eventos · página {page} de {totalPages}
              </p>
              <div className="flex gap-1">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                  className="px-3 py-1.5 text-xs border rounded-lg disabled:opacity-40 hover:bg-gray-50">
                  ← Anterior
                </button>
                <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1.5 text-xs border rounded-lg disabled:opacity-40 hover:bg-gray-50">
                  Siguiente →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
