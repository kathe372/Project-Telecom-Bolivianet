import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  chatbotService,
  type ClientConversationHistoryDto, type ConversationMessageDto,
} from '@/services/chatbotService';

export function ChatHistoryTab({ phone }: { phone: string }) {
  const [history, setHistory] = useState<ClientConversationHistoryDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    chatbotService.getClientHistory(phone)
      .then(h => { setHistory(h); setSelected(0); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [phone]);

  const fmtTime = (d: string) =>
    new Date(d).toLocaleString('es-BO', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });

  if (loading) return (
    <div className="card p-8 flex justify-center">
      <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
    </div>
  );

  if (error) return (
    <div className="card p-8 text-center text-gray-400 text-sm">
      Error al cargar el historial de conversaciones. Verifica que el servicio de chatbot esté activo.
    </div>
  );

  if (!history || history.Conversaciones.length === 0) return (
    <div className="card p-8 text-center text-gray-400 text-sm">
      Este cliente no tiene conversaciones registradas por WhatsApp.
    </div>
  );

  const conv = history.Conversaciones[selected];

  return (
    <div className="space-y-3">
      {history.Conversaciones.length > 1 && (
        <div className="card p-3">
          <p className="text-xs font-medium text-gray-500 mb-2">
            {history.Conversaciones.length} conversaciones — selecciona una:
          </p>
          <div className="flex flex-wrap gap-2">
            {history.Conversaciones.map((c, i) => (
              <button
                key={c.Id}
                onClick={() => setSelected(i)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  i === selected
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                }`}
              >
                {new Date(c.UpdatedAt).toLocaleDateString('es-BO')}
                {c.TotalMessages > 0 && ` · ${c.TotalMessages} msgs`}
              </button>
            ))}
          </div>
        </div>
      )}

      <ConversationThread conv={conv} fmtTime={fmtTime} />
    </div>
  );
}

function ConversationThread({
  conv, fmtTime,
}: {
  conv: ClientConversationHistoryDto['Conversaciones'][number];
  fmtTime: (d: string) => string;
}) {
  const [messages,  setMessages]  = useState<ConversationMessageDto[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setLoadError(false);
    chatbotService.getConversacion(conv.PhoneNumber)
      .then(detail => setMessages(detail.Messages))
      .catch(() => { setMessages([]); setLoadError(true); })
      .finally(() => setLoading(false));
  }, [conv.PhoneNumber]);

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">
          Historial WhatsApp — {conv.PhoneNumber}
          {conv.IsEscalated && (
            <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">
              Escalada {conv.AgentName ? `→ ${conv.AgentName}` : ''}
            </span>
          )}
        </p>
        <span className="text-xs text-gray-400">{conv.TotalMessages} mensajes</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
        </div>
      ) : loadError ? (
        <p className="text-xs text-red-400 text-center py-4">
          Error al cargar los mensajes. Verifica que el servicio de chatbot esté activo.
        </p>
      ) : messages.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-4">Sin mensajes en esta conversación.</p>
      ) : (
        <div className="max-h-96 overflow-y-auto space-y-2 bg-[#efeae2] rounded-lg p-3">
          {messages.map(msg => {
            const isUser = msg.Role === 'user';
            return (
              <div key={msg.Id} className={`flex ${isUser ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[75%] px-3 py-1.5 rounded-lg shadow-sm text-sm ${
                  isUser ? 'bg-white text-gray-800' : 'bg-[#dcf8c6] text-gray-800'
                }`}>
                  {msg.Role === 'bot' && (
                    <p className="text-xs text-gray-400 mb-0.5">Bot</p>
                  )}
                  {msg.Role === 'admin' && (
                    <p className="text-xs text-blue-500 mb-0.5">Agente</p>
                  )}
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.Content}</p>
                  <p className="text-right text-xs text-gray-400 mt-0.5">{fmtTime(msg.CreatedAt)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
