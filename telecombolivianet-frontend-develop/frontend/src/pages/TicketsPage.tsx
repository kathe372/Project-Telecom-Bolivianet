import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Search, Plus, Loader2, AlertCircle, LayoutList, Columns, RefreshCw,
} from 'lucide-react';
import { ticketService } from '@/services/ticketService';
import { userService } from '@/services/userService';
import { useAuthStore } from '@/store/authStore';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useTicketStore } from '@/store/ticketStore';
import type {
  TicketListItemDto, TicketDetailDto, TicketFilterRequest, TicketKpiDto,
} from '@/types/ticket.types';
import type { UserSystemDto, PagedResult } from '@/types/auth.types';
import { TicketDetailModal } from '@/components/tickets/TicketDetailModal';
import { CreateTicketModal } from '@/components/tickets/CreateTicketModal';
import { TicketKpiCards } from '@/components/tickets/TicketKpiCards';
import { TicketRow } from '@/components/tickets/TicketRow';
import { KanbanView } from '@/components/tickets/KanbanView';
import {
  TICKET_TYPES, PRIORITIES, STATUSES, KANBAN_LABELS,
} from '@/components/tickets/ticketHelpers';

export default function TicketsPage() {
  usePageTitle('Tickets');
  const isAdmin = useAuthStore(s => s.isAdmin);
  const setSlaBreachedCount = useTicketStore(s => s.setSlaBreachedCount);

  const [result,     setResult]     = useState<PagedResult<TicketListItemDto> | null>(null);
  const [kanban,     setKanban]     = useState<Record<string, TicketListItemDto[]>>({});
  const [kpi,        setKpi]        = useState<TicketKpiDto | null>(null);
  const [technicians,setTechnicians]= useState<UserSystemDto[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [view,       setView]       = useState<'list' | 'kanban'>('list');
  const [showCreate, setShowCreate] = useState(false);
  const [selected,   setSelected]   = useState<TicketDetailDto | null>(null);

  const [filter, setFilter] = useState<TicketFilterRequest>({
    Search: '', Status: 'all', Priority: 'all', Type: 'all', PageNumber: 1, PageSize: 20,
  });
  const [searchText, setSearchText] = useState('');
  const listSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadTechnicians = useCallback(async () => {
    try {
      const res = await userService.getAll(1, 100);
      setTechnicians(res.Items.filter((u: UserSystemDto) => u.Role === 'Admin' || u.Role === 'Tecnico'));
    } catch {  }
  }, []);

  const loadKanban = useCallback(async () => {
    try {
      setKanban(await ticketService.getKanban({
        Search: filter.Search, Status: filter.Status,
        Priority: filter.Priority, Type: filter.Type, AssignedToId: filter.AssignedToId,
      }));
    } catch {  }
  }, [filter.Search, filter.Status, filter.Priority, filter.Type, filter.AssignedToId]);

  const loadSlaAlerts = useCallback(async () => {
    try {
      const alerts = await ticketService.getSlaAlerts();
      setSlaBreachedCount(alerts.Breached.length);
    } catch {  }
  }, [setSlaBreachedCount]);

  const loadData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [listRes, kpiRes] = await Promise.all([ticketService.getAll(filter), ticketService.getKpi()]);
      setResult(listRes); setKpi(kpiRes);
    } catch { setError('Error al cargar los tickets. Verifica tu conexión.'); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { loadTechnicians(); }, [loadTechnicians]);
  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { loadSlaAlerts(); }, [loadSlaAlerts]);
  useEffect(() => { if (view === 'kanban') loadKanban(); }, [view, loadKanban]);

  const openDetail = async (t: TicketListItemDto) => {
    try { setSelected(await ticketService.getById(t.Id)); } catch {  }
  };

  const totalPages = result ? Math.ceil(result.TotalCount / (filter.PageSize ?? 20)) : 0;
  const setPage    = (p: number) => setFilter(f => ({ ...f, PageNumber: p }));

  return (
    <div className="p-6 max-w-7xl mx-auto">

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Tickets de Soporte</h1>
          <p className="text-sm text-gray-500 mt-0.5">{result?.TotalCount ?? 0} tickets en total</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadData} className="btn-secondary p-2" title="Recargar"><RefreshCw className="w-4 h-4" /></button>
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            {(['list', 'kanban'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                  ${view === v ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                {v === 'list' ? <><LayoutList className="w-4 h-4" />Lista</> : <><Columns className="w-4 h-4" />Kanban</>}
              </button>
            ))}
          </div>
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus className="w-4 h-4" />Nuevo Ticket
          </button>
        </div>
      </div>

      {kpi && <TicketKpiCards kpi={kpi} />}

      <div className="card p-4 mb-5">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="input-field pl-9" placeholder="Buscar por asunto, cliente o TBN..."
              value={searchText}
              onChange={e => {
                const val = e.target.value;
                setSearchText(val);
                if (listSearchRef.current) clearTimeout(listSearchRef.current);
                listSearchRef.current = setTimeout(
                  () => setFilter(f => ({ ...f, Search: val, PageNumber: 1 })),
                  350,
                );
              }} />
          </div>
          <select className="input-field w-auto" value={filter.Status ?? 'all'}
            onChange={e => setFilter(f => ({ ...f, Status: e.target.value, PageNumber: 1 }))}>
            <option value="all">Todos los estados</option>
            {STATUSES.map(s => <option key={s} value={s}>{KANBAN_LABELS[s] ?? s}</option>)}
          </select>
          <select className="input-field w-auto" value={filter.Priority ?? 'all'}
            onChange={e => setFilter(f => ({ ...f, Priority: e.target.value, PageNumber: 1 }))}>
            <option value="all">Todas las prioridades</option>
            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="input-field w-auto" value={filter.Type ?? 'all'}
            onChange={e => setFilter(f => ({ ...f, Type: e.target.value, PageNumber: 1 }))}>
            <option value="all">Todos los tipos</option>
            {Object.entries(TICKET_TYPES).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 rounded-lg border border-red-200 mb-4">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
          <button className="ml-auto text-xs text-red-600 underline" onClick={loadData}>Reintentar</button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      )}

      {!loading && view === 'list' && (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Asunto', 'Cliente', 'Tipo', 'Estado', 'Prioridad', 'SLA', 'Asignado a', ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(result?.Items.length ?? 0) === 0
                    ? <tr><td colSpan={8} className="text-center py-12 text-gray-400 text-sm">No se encontraron tickets.</td></tr>
                    : result?.Items.map(t => <TicketRow key={t.Id} ticket={t} onClick={() => openDetail(t)} />)}
                </tbody>
              </table>
            </div>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-500">Página {filter.PageNumber} de {totalPages} · {result?.TotalCount} total</p>
              <div className="flex gap-1">
                <button className="btn-secondary px-3 py-1.5 text-xs"
                  onClick={() => setPage((filter.PageNumber ?? 1) - 1)}
                  disabled={(filter.PageNumber ?? 1) <= 1}>Anterior</button>
                <button className="btn-secondary px-3 py-1.5 text-xs"
                  onClick={() => setPage((filter.PageNumber ?? 1) + 1)}
                  disabled={(filter.PageNumber ?? 1) >= totalPages}>Siguiente</button>
              </div>
            </div>
          )}
        </>
      )}

      {!loading && view === 'kanban' && <KanbanView kanban={kanban} onTicketClick={openDetail} />}

      {selected && (
        <TicketDetailModal
          ticket={selected} technicians={technicians}
          isAdmin={isAdmin()} onClose={() => setSelected(null)} onRefresh={loadData} />
      )}

      {showCreate && (
        <CreateTicketModal
          technicians={technicians}
          onClose={() => setShowCreate(false)}
          onCreated={loadData} />
      )}
    </div>
  );
}
