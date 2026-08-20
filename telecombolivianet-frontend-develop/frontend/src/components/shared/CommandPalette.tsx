import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Users, Ticket, LayoutDashboard, FileText,
  CreditCard, Settings, X, ArrowRight, Loader2,
  Wifi, Bell, ClipboardList,
} from 'lucide-react';
import { clientService } from '@/services/clientService';
import { ticketService } from '@/services/ticketService';
import type { ClientListItemDto } from '@/types/client.types';
import type { TicketListItemDto } from '@/types/ticket.types';


interface QuickLink { label: string; to: string; icon: React.ReactNode; }

type Item =
  | { kind: 'client'; data: ClientListItemDto }
  | { kind: 'ticket'; data: TicketListItemDto }
  | { kind: 'quick';  data: QuickLink };


const QUICK_LINKS: QuickLink[] = [
  { label: 'Dashboard',        to: '/dashboard',            icon: <LayoutDashboard className="w-4 h-4" /> },
  { label: 'Clientes',         to: '/clients',              icon: <Users className="w-4 h-4" /> },
  { label: 'Tickets',          to: '/tickets',              icon: <Ticket className="w-4 h-4" /> },
  { label: 'Cobranza',         to: '/invoices',             icon: <FileText className="w-4 h-4" /> },
  { label: 'Historial Pagos',  to: '/payments',             icon: <CreditCard className="w-4 h-4" /> },
  { label: 'Instalaciones',    to: '/instalaciones',        icon: <Wifi className="w-4 h-4" /> },
  { label: 'Notificaciones',   to: '/notifications/config', icon: <Bell className="w-4 h-4" /> },
  { label: 'Auditoría',        to: '/audit-logs',           icon: <ClipboardList className="w-4 h-4" /> },
  { label: 'Configuración',    to: '/settings',             icon: <Settings className="w-4 h-4" /> },
];


const CLIENT_STATUS_COLOR: Record<string, string> = {
  Activo:     'text-green-600',
  Suspendido: 'text-amber-600',
  DadoDeBaja: 'text-gray-400',
};
const TICKET_PRIO_COLOR: Record<string, string> = {
  Critica: 'text-red-600',
  Alta:    'text-orange-500',
  Media:   'text-yellow-600',
  Baja:    'text-blue-500',
};


interface Props { open: boolean; onClose: () => void; }

export default function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate();
  const inputRef  = useRef<HTMLInputElement>(null);
  const listRef   = useRef<HTMLDivElement>(null);

  const [query,   setQuery]   = useState('');
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<ClientListItemDto[]>([]);
  const [tickets, setTickets] = useState<TicketListItemDto[]>([]);
  const [active,  setActive]  = useState(0);

  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeqRef = useRef(0);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setClients([]); setTickets([]); return; }
    const seq = ++searchSeqRef.current;
    setLoading(true);
    try {
      const [c, t] = await Promise.all([
        clientService.getAll({ Search: q, PageSize: 5 }),
        ticketService.getAll({ Search: q, PageSize: 5 }),
      ]);
      if (seq !== searchSeqRef.current) return;
      setClients(c.Items ?? []);
      setTickets(t.Items ?? []);
    } catch {
    } finally {
      if (seq === searchSeqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 280);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setClients([]);
    setTickets([]);
    setActive(0);
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [open, onClose]);

  const hasResults = query.length >= 2;

  const items = useMemo<Item[]>(() => (
    hasResults
      ? [
          ...clients.map(d => ({ kind: 'client' as const, data: d })),
          ...tickets.map(d => ({ kind: 'ticket' as const, data: d })),
        ]
      : QUICK_LINKS.map(d => ({ kind: 'quick' as const, data: d }))
  ), [hasResults, clients, tickets]);

  const selectItem = useCallback((item: Item | undefined) => {
    if (!item) return;
    if (item.kind === 'client') navigate(`/clients/${item.data.Id}/edit`);
    else if (item.kind === 'ticket') navigate('/tickets');
    else navigate(item.data.to);
    onClose();
  }, [navigate, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter')   { e.preventDefault(); selectItem(items[active]); }
  }, [items, active, selectItem]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200"
        onClick={e => e.stopPropagation()}
      >
        {}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          {loading
            ? <Loader2 className="w-4 h-4 text-gray-400 shrink-0 animate-spin" />
            : <Search className="w-4 h-4 text-gray-400 shrink-0" />
          }
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Buscar cliente, ticket, página..."
            className="flex-1 text-sm text-gray-900 placeholder-gray-400 outline-none bg-transparent"
          />
          {query && (
            <button onClick={() => setQuery('')} className="p-0.5 rounded text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded border border-gray-200 text-[10px] font-mono text-gray-400">
            Esc
          </kbd>
        </div>

        {}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
          {!hasResults && (
            <>
              <p className="px-4 pt-1 pb-2 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                Navegación rápida
              </p>
              {QUICK_LINKS.map((link, i) => (
                <button
                  key={link.to}
                  data-idx={i}
                  onClick={() => selectItem({ kind: 'quick', data: link })}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                    active === i ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className={active === i ? 'text-blue-500' : 'text-gray-400'}>{link.icon}</span>
                  <span className="flex-1">{link.label}</span>
                  <ArrowRight className={`w-3.5 h-3.5 ${active === i ? 'text-blue-400' : 'text-gray-300'}`} />
                </button>
              ))}
            </>
          )}

          {hasResults && !loading && clients.length === 0 && tickets.length === 0 && (
            <p className="px-4 py-8 text-sm text-gray-400 text-center">
              Sin resultados para "{query}"
            </p>
          )}

          {hasResults && clients.length > 0 && (
            <>
              <p className="px-4 pt-1 pb-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                Clientes
              </p>
              {clients.map((c, i) => (
                <button
                  key={c.Id}
                  data-idx={i}
                  onClick={() => selectItem({ kind: 'client', data: c })}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    active === i ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    active === i ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {c.FullName.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${active === i ? 'text-blue-700' : 'text-gray-800'}`}>
                      {c.FullName}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {c.TbnCode} · {c.Zone} · {c.PlanName}
                    </p>
                  </div>
                  <span className={`text-xs font-medium shrink-0 ${CLIENT_STATUS_COLOR[c.Status] ?? 'text-gray-400'}`}>
                    {c.Status}
                  </span>
                </button>
              ))}
            </>
          )}

          {hasResults && tickets.length > 0 && (
            <>
              <p className="px-4 pt-2 pb-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                Tickets
              </p>
              {tickets.map((t, i) => {
                const idx = clients.length + i;
                return (
                  <button
                    key={t.Id}
                    data-idx={idx}
                    onClick={() => selectItem({ kind: 'ticket', data: t })}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      active === idx ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <Ticket className={`w-4 h-4 shrink-0 ${
                      active === idx ? 'text-blue-500' : 'text-gray-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${active === idx ? 'text-blue-700' : 'text-gray-800'}`}>
                        {t.Subject}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {t.ClientName} · {t.TicketNumber ?? t.Id.slice(0, 8)}
                      </p>
                    </div>
                    <span className={`text-xs font-semibold shrink-0 ${TICKET_PRIO_COLOR[t.Priority] ?? 'text-gray-400'}`}>
                      {t.Priority}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>

        {}
        <div className="px-4 py-2.5 border-t border-gray-100 flex items-center gap-4 text-[11px] text-gray-400">
          <span><kbd className="font-mono bg-gray-100 px-1 rounded">↑↓</kbd> Navegar</span>
          <span><kbd className="font-mono bg-gray-100 px-1 rounded">↵</kbd> Abrir</span>
          <span><kbd className="font-mono bg-gray-100 px-1 rounded">Esc</kbd> Cerrar</span>
        </div>
      </div>
    </div>
  );
}
