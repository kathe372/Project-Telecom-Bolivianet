import { useEffect, useState } from 'react';
import { ImageOff, Mic, ZoomIn } from 'lucide-react';
import type { ConversationMessageDto } from '@/services/chatbotService';
import { fmtTime } from './conversationHelpers';

export function ChatBubble({ msg, onImageClick }: { msg: ConversationMessageDto; onImageClick?: (url: string) => void }) {
  const [imgError, setImgError] = useState(false);
  const [blobUrl, setBlobUrl]   = useState<string | null>(null);

  useEffect(() => {
    if (!msg.MediaUrl) return;
    const isNgrok = /ngrok/.test(msg.MediaUrl);
    if (!isNgrok) return;
    let objectUrl: string | null = null;
    fetch(msg.MediaUrl, { headers: { 'ngrok-skip-browser-warning': 'true' } })
      .then(r => r.blob())
      .then(blob => { objectUrl = URL.createObjectURL(blob); setBlobUrl(objectUrl); })
      .catch(() => setImgError(true));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [msg.MediaUrl]);

  const resolvedImgUrl = blobUrl ?? msg.MediaUrl ?? '';
  const isUser  = msg.Role === 'user';
  const isAdmin = msg.Role === 'admin';
  const isAudio = msg.MediaType === 'audio' && !!msg.MediaUrl;
  const isImage = (msg.MediaType === 'image' || msg.MediaType === 'sticker') && !!msg.MediaUrl;

  const bubbleBg =
    isUser  ? 'bg-white text-gray-800 rounded-tl-sm' :
    isAdmin ? 'bg-blue-600 text-white rounded-tr-sm' :
              'bg-[#dcf8c6] text-gray-800 rounded-tr-sm';

  return (
    <div className={`flex ${isUser ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[70%] rounded-2xl shadow-sm overflow-hidden ${bubbleBg} ${isImage ? 'p-1' : 'px-3 py-2'}`}>
        {isAdmin && !isImage && (
          <p className="text-xs font-semibold mb-0.5 opacity-80">Agente</p>
        )}

        {isImage ? (
          <div className="relative">
            {imgError ? (
              <div className="flex flex-col items-center justify-center gap-1 w-48 h-32 bg-gray-100 text-gray-400 rounded-xl">
                <ImageOff className="w-6 h-6" />
                <span className="text-xs">Imagen no disponible</span>
                <a href={msg.MediaUrl!} target="_blank" rel="noreferrer"
                  className="text-xs text-blue-500 underline">Abrir enlace</a>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onImageClick?.(resolvedImgUrl)}
                className="group relative block focus:outline-none"
              >
                <img
                  src={resolvedImgUrl}
                  alt="Imagen"
                  className="rounded-xl max-w-[240px] max-h-64 object-cover block"
                  onError={() => setImgError(true)}
                />
                <div className="absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                  <ZoomIn className="w-7 h-7 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </button>
            )}
            {msg.Content && (
              <p className={`text-sm whitespace-pre-wrap leading-relaxed px-2 pt-1.5 pb-0.5 ${isUser ? 'text-gray-800' : ''}`}>
                {msg.Content}
              </p>
            )}
            <p className={`text-right text-xs px-2 pb-1 ${isUser ? 'text-gray-400' : 'opacity-60'}`}>
              {fmtTime(msg.CreatedAt)}
            </p>
          </div>
        ) : isAudio ? (
          <>
            <div className="flex items-center gap-1.5 mb-0.5">
              <Mic className="w-3.5 h-3.5 opacity-60 shrink-0" />
              <audio controls src={msg.MediaUrl!} className="max-w-[220px]" style={{ height: '32px' }} />
            </div>
            <p className={`text-right text-xs mt-0.5 ${isUser ? 'text-gray-400' : 'opacity-60'}`}>
              {fmtTime(msg.CreatedAt)}
            </p>
          </>
        ) : (
          <>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.Content}</p>
            <p className={`text-right text-xs mt-0.5 ${isUser ? 'text-gray-400' : 'opacity-60'}`}>
              {fmtTime(msg.CreatedAt)}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
