import { useEffect, useState, useCallback, useRef } from 'react';
import {
  MessageSquare, Loader2, Search, RefreshCw, Wifi, WifiOff,
} from 'lucide-react';
import {
  chatbotService,
  type ConversationListItemDto,
  type ConversationDetailDto,
  type ConversationStatsDto,
} from '@/services/chatbotService';
import { useAdminHub } from '@/hooks/useAdminHub';
import { useAuthContext } from '@/contexts/AuthContext';
import { ConvListItem } from '@/components/conversations/ConvListItem';
import { ChatBubble } from '@/components/conversations/ChatBubble';
import { ChatHeader } from '@/components/conversations/ChatHeader';
import { MessageComposer } from '@/components/conversations/MessageComposer';
import { ImageLightbox } from '@/components/conversations/ImageLightbox';

type BandejaTab = 'sin-responder' | 'en-atencion' | 'escaladas' | 'todas';

const TAB_LABELS: Record<BandejaTab, string> = {
  'sin-responder': 'Sin responder',
  'en-atencion':   'En atención',
  'escaladas':     'Escaladas',
  'todas':         'Todas',
};

const LS_KEY = 'conv_last_read';

function loadUnreadMap(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
  catch { return {}; }
}

export default function ConversationsPage() {
  useAuthContext();
  const [tab, setTab]                     = useState<BandejaTab>('sin-responder');
  const [conversations, setConversations] = useState<ConversationListItemDto[]>([]);
  const [total, setTotal]                 = useState(0);
  const [stats, setStats]                 = useState<ConversationStatsDto | null>(null);
  const [loading, setLoading]             = useState(true);
  const [selected, setSelected]           = useState<string | null>(null);
  const [detail, setDetail]               = useState<ConversationDetailDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch]               = useState('');
  const [page, setPage]                   = useState(1);
  const [error, setError]                 = useState<string | null>(null);
  const [messageText, setMessageText]     = useState('');
  const [sending, setSending]             = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [lightboxUrl, setLightboxUrl]     = useState<string | null>(null);
  const messagesEndRef                    = useRef<HTMLDivElement>(null);
  const textareaRef                       = useRef<HTMLTextAreaElement>(null);

  const [unreadMap, setUnreadMap] = useState<Record<string, string>>(loadUnreadMap);

  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;

  const { status: hubStatus } = useAdminHub({
    onBotEvent: useCallback(() => {
      loadSilentRef.current?.();
    }, []),
  });

  const loadSilentRef = useRef<(() => void) | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [convRes, statsRes] = await Promise.all([
        chatbotService.getConversaciones(page, 30, tab),
        chatbotService.getStats(),
      ]);
      setConversations(convRes.Items);
      setTotal(convRes.Total);
      setStats(statsRes);
    } catch {
      setError('Error al cargar las conversaciones.');
    } finally { setLoading(false); }
  }, [tab, page]);

  const loadSilent = useCallback(async () => {
    try {
      const [convRes, statsRes] = await Promise.all([
        chatbotService.getConversaciones(page, 30, tab),
        chatbotService.getStats(),
      ]);
      setConversations(convRes.Items);
      setTotal(convRes.Total);
      setStats(statsRes);
    } catch {
      // Silencio deliberado: esto es el refresco en segundo plano, no la carga
      // inicial. La carga inicial (`load`, arriba) SÍ muestra el error. Aquí lo
      // correcto es conservar lo último bueno y reintentar en el siguiente
      // ciclo; un aviso por cada fallo pasajero de red sería ruido constante.
    }
  }, [tab, page]);

  useEffect(() => { loadSilentRef.current = loadSilent; }, [loadSilent]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (loading || conversations.length === 0) return;
    setUnreadMap(prev => {
      let changed = false;
      const next = { ...prev };
      for (const conv of conversations) {
        if (!(conv.PhoneNumber in next)) {
          next[conv.PhoneNumber] = conv.UpdatedAt;
          changed = true;
        }
      }
      if (changed) {
        localStorage.setItem(LS_KEY, JSON.stringify(next));
        return next;
      }
      return prev;
    });
  }, [loading, conversations]);

  useEffect(() => {
    const id = setInterval(loadSilent, 15_000);
    return () => clearInterval(id);
  }, [loadSilent]);

  useEffect(() => {
    if (!selected) return;
    const id = setInterval(async () => {
      const phone = selectedRef.current;
      if (!phone) return;
      try {
        const d = await chatbotService.getConversacion(phone);
        setDetail(d);
      } catch {
        // Mismo criterio que en loadSilent: es sondeo periódico y conservar la
        // conversación que ya se está leyendo vale más que avisar de un fallo
        // que el siguiente ciclo probablemente resuelva.
      }
    }, 10_000);
    return () => clearInterval(id);
  }, [selected]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [detail?.Messages]);

  const markAsRead = useCallback((phone: string) => {
    const ts = new Date().toISOString();
    setUnreadMap(prev => {
      const next = { ...prev, [phone]: ts };
      localStorage.setItem(LS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const isUnread = (conv: ConversationListItemDto): boolean => {
    if (conv.PhoneNumber === selected) return false;
    const lastRead = unreadMap[conv.PhoneNumber];
    if (!lastRead) return false;
    return new Date(conv.UpdatedAt) > new Date(lastRead);
  };

  const reloadDetail = async (phone: string) => {
    setDetailLoading(true);
    try {
      const d = await chatbotService.getConversacion(phone);
      setDetail(d);
    } catch {
      setError('Error al actualizar la conversación.');
    } finally { setDetailLoading(false); }
  };

  const handleTakeover = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await chatbotService.tomarConversacion(selected);
      await reloadDetail(selected);
      textareaRef.current?.focus();
    } catch {
      setError('Error al tomar la conversación.');
    } finally { setActionLoading(false); }
  };

  const handleRelease = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await chatbotService.devolverConversacion(selected);
      await reloadDetail(selected);
    } catch {
      setError('Error al devolver la conversación al bot.');
    } finally { setActionLoading(false); }
  };

  const handleSend = async () => {
    if (!selected || !messageText.trim() || sending) return;
    setSending(true);
    const text = messageText.trim();
    setMessageText('');
    try {
      await chatbotService.sendMessage(selected, text);
      await reloadDetail(selected);
    } catch {
      setMessageText(text);
      setError('Error al enviar el mensaje.');
    } finally { setSending(false); }
  };

  const handleSelectConv = async (phone: string) => {
    setSelected(phone);
    markAsRead(phone);
    setDetailLoading(true);
    try {
      const d = await chatbotService.getConversacion(phone);
      setDetail(d);
    } catch {
      setError('Error al cargar la conversación.');
    } finally { setDetailLoading(false); }
  };

  const filtered = conversations.filter(c =>
    !search ||
    c.ClientName?.toLowerCase().includes(search.toLowerCase()) ||
    c.PhoneNumber.includes(search)
  );

  const escaladas   = conversations.filter(c => c.IsEscalated).length;
  const totalUnread = conversations.filter(isUnread).length;

  return (
    <>
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">
      <div className="w-80 border-r border-gray-200 flex flex-col bg-white">
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-green-600" /> WhatsApp
              {totalUnread > 0 && (
                <span className="ml-1 bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                  {totalUnread}
                </span>
              )}
            </h2>
            <div className="flex items-center gap-1.5">
              <span title={hubStatus === 'connected' ? 'Tiempo real activo' : 'Tiempo real desconectado'}>
                {hubStatus === 'connected'
                  ? <Wifi    className="w-3.5 h-3.5 text-green-500" />
                  : <WifiOff className="w-3.5 h-3.5 text-gray-400"  />}
              </span>
              <button onClick={load} className="text-gray-400 hover:text-gray-600">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {stats && (
            <div className="grid grid-cols-2 gap-2">
              {[
                { l: 'Hoy',      v: stats.HoyConversaciones },
                { l: 'Escaladas', v: stats.Escaladas, red: stats.Escaladas > 0 },
              ].map(s => (
                <div key={s.l} className="bg-gray-50 rounded-lg p-2 text-center">
                  <p className={`text-lg font-bold ${s.red ? 'text-red-600' : 'text-gray-800'}`}>{s.v}</p>
                  <p className="text-xs text-gray-400">{s.l}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex border-b border-gray-100 overflow-x-auto">
          {(Object.keys(TAB_LABELS) as BandejaTab[]).map(t => (
            <button key={t}
              onClick={() => { setTab(t); setPage(1); setSelected(null); setDetail(null); }}
              className={`flex-1 px-2 py-2 text-xs font-medium whitespace-nowrap transition-colors relative ${
                tab === t ? 'text-green-700 border-b-2 border-green-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {TAB_LABELS[t]}
              {t === 'escaladas' && escaladas > 0 && (
                <span className="absolute top-1 right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center text-[10px]">
                  {escaladas}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="px-3 py-2 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre o teléfono…"
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : error ? (
            <div className="p-4 text-center text-red-500 text-sm">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-center text-gray-400 text-sm">Sin conversaciones.</div>
          ) : (
            filtered.map(conv => (
              <ConvListItem
                key={conv.Id}
                conv={conv}
                selected={selected === conv.PhoneNumber}
                unread={isUnread(conv)}
                onClick={() => handleSelectConv(conv.PhoneNumber)}
              />
            ))
          )}
        </div>

        {total > 30 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 text-xs text-gray-500">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="px-2 py-1 border rounded disabled:opacity-40">← Ant</button>
            <span>{page}</span>
            <button disabled={page * 30 >= total} onClick={() => setPage(p => p + 1)}
              className="px-2 py-1 border rounded disabled:opacity-40">Sig →</button>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col bg-[#f0f2f5]">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-200" />
              <p className="text-sm">Selecciona una conversación para verla</p>
            </div>
          </div>
        ) : detailLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : detail ? (
          <>
            <ChatHeader
              detail={detail}
              actionLoading={actionLoading}
              onTakeover={handleTakeover}
              onRelease={handleRelease}
            />

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {detail.Messages.map(msg => (
                <ChatBubble key={msg.Id} msg={msg} onImageClick={setLightboxUrl} />
              ))}
              <div ref={messagesEndRef} />
            </div>

            {detail.IsEscalated && (
              <MessageComposer
                value={messageText}
                onChange={setMessageText}
                onSend={handleSend}
                sending={sending}
                textareaRef={textareaRef}
              />
            )}
          </>
        ) : null}
      </div>
    </div>

    {lightboxUrl && (
      <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    )}
    </>
  );
}
