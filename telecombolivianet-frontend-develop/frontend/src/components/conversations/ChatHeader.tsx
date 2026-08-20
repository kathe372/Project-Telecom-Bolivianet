import { Bot, Loader2, UserCheck } from 'lucide-react';
import type { ConversationDetailDto } from '@/services/chatbotService';
import { getInitials, avatarColor } from './conversationHelpers';

export function ChatHeader({
  detail, actionLoading, onTakeover, onRelease,
}: {
  detail: ConversationDetailDto;
  actionLoading: boolean;
  onTakeover: () => void;
  onRelease: () => void;
}) {
  return (
    <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-full ${avatarColor(detail.PhoneNumber)} flex items-center justify-center text-white text-xs font-bold select-none`}>
        {getInitials(detail.ClientName, detail.PhoneNumber)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-gray-900">
          {detail.ClientName ?? detail.PhoneNumber}
        </p>
        <p className="text-xs text-gray-400 flex items-center gap-2">
          {detail.PhoneNumber}
          {detail.IsEscalated && (
            <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">
              Escalada {detail.AgentName ? `→ ${detail.AgentName}` : ''}
            </span>
          )}
        </p>
      </div>

      {detail.IsEscalated ? (
        <button
          onClick={onRelease}
          disabled={actionLoading}
          title="Devolver la conversación al bot"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
        >
          {actionLoading
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Bot className="w-3.5 h-3.5" />}
          Devolver al bot
        </button>
      ) : (
        <button
          onClick={onTakeover}
          disabled={actionLoading}
          title="Tomar el control de esta conversación"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {actionLoading
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <UserCheck className="w-3.5 h-3.5" />}
          Tomar conversación
        </button>
      )}
    </div>
  );
}
