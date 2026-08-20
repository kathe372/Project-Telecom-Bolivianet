export function WhatsAppBubble({ texto, variablesNoEncontradas }: { texto: string; variablesNoEncontradas: string[] }) {
  const rendered = texto.split('\n').map((line, i) => {
    const parts = line.split(/(\*[^*]+\*)/g);
    return (
      <p key={i} className={i > 0 ? 'mt-1' : ''}>
        {parts.map((part, j) =>
          part.startsWith('*') && part.endsWith('*')
            ? <strong key={j}>{part.slice(1, -1)}</strong>
            : <span key={j}>{part}</span>
        )}
      </p>
    );
  });

  return (
    <div className="bg-[#ECE5DD] rounded-xl p-4 min-h-[160px]">
      <div className="flex justify-end">
        <div className="bg-[#DCF8C6] rounded-lg rounded-tr-none p-3 max-w-[85%] shadow-sm text-sm text-gray-800 leading-relaxed">
          {rendered}
          <div className="text-right text-xs text-gray-400 mt-1">12:00 ✓✓</div>
        </div>
      </div>
      {variablesNoEncontradas.length > 0 && (
        <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          <strong>Variables sin datos:</strong> {variablesNoEncontradas.join(', ')}
        </div>
      )}
    </div>
  );
}
