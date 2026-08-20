import type { KeyboardEvent, RefObject } from 'react';
import { Bot, Loader2, Send } from 'lucide-react';

export function MessageComposer({
  value, onChange, onSend, sending, textareaRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  sending: boolean;
  textareaRef: RefObject<HTMLTextAreaElement>;
}) {
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <>
      <div className="mx-4 mb-2 mt-1 flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-700">
        <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-500" />
        <span>
          <span className="font-semibold">Bot silenciado</span> — el agente tiene el control de esta conversación.
          Pulsa <span className="font-semibold">Devolver al bot</span> para reactivarlo.
        </span>
      </div>
      <div className="bg-white border-t border-gray-200 px-4 py-3 flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribe un mensaje… (Enter para enviar, Shift+Enter para nueva línea)"
          rows={1}
          className="flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 max-h-32 overflow-y-auto"
          style={{ minHeight: '40px' }}
        />
        <button
          onClick={onSend}
          disabled={!value.trim() || sending}
          className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {sending
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Send className="w-4 h-4" />}
        </button>
      </div>
    </>
  );
}
