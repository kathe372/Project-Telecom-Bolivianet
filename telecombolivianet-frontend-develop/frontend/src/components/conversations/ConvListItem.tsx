import { ArrowUpRight, Image, Mic } from 'lucide-react';
import type { ConversationListItemDto } from '@/services/chatbotService';
import { fmtRelative, getInitials, avatarColor } from './conversationHelpers';

export function ConvListItem({
  conv, selected, unread, onClick,
}: {
  conv: ConversationListItemDto;
  selected: boolean;
  unread: boolean;
  onClick: () => void;
}) {
  const initials = getInitials(conv.ClientName, conv.PhoneNumber);
  const color    = avatarColor(conv.PhoneNumber);

  return (
    <div
      onClick={onClick}
      className={`flex items-start gap-3 px-3 py-3 cursor-pointer border-b border-gray-50 transition-colors ${
        selected ? 'bg-green-50 border-l-2 border-l-green-500' : 'hover:bg-gray-50'
      }`}
    >
      <div className="relative shrink-0">
        <div className={`w-9 h-9 rounded-full ${color} flex items-center justify-center text-white text-xs font-bold select-none`}>
          {initials}
        </div>
        {unread && (
          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <p className={`text-sm truncate ${unread ? 'font-semibold text-gray-900' : 'font-medium text-gray-900'}`}>
            {conv.ClientName ?? conv.PhoneNumber}
          </p>
          <span className={`text-xs shrink-0 ml-1 ${unread ? 'text-green-600 font-semibold' : 'text-gray-400'}`}>
            {fmtRelative(conv.UpdatedAt)}
          </span>
        </div>
        {conv.UltimoMensaje ? (
          <p className={`text-xs truncate flex items-center gap-1 ${unread ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
            {conv.UltimoMensaje.startsWith('[Imagen]') || conv.UltimoMensaje.startsWith('📷') ? (
              <><Image className="w-3 h-3 shrink-0" /><span>Foto</span></>
            ) : conv.UltimoMensaje.startsWith('[Audio]') || conv.UltimoMensaje.startsWith('🎤') ? (
              <><Mic className="w-3 h-3 shrink-0" /><span>Audio</span></>
            ) : (
              conv.UltimoMensaje
            )}
          </p>
        ) : (
          <p className="text-xs text-gray-300 truncate italic">Sin mensajes</p>
        )}
        {conv.IsEscalated && (
          <span className="inline-flex items-center gap-0.5 text-xs bg-orange-50 text-orange-600 px-1.5 rounded font-medium mt-0.5">
            <ArrowUpRight className="w-3 h-3" /> Escalada
          </span>
        )}
      </div>
    </div>
  );
}
