import { ArrowUpRight, X } from 'lucide-react';

export function ImageLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[200] bg-black/85 flex items-center justify-center"
      onClick={onClose}
      onKeyDown={e => e.key === 'Escape' && onClose()}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/80 hover:text-white bg-black/40 rounded-full p-1.5 transition-colors"
        aria-label="Cerrar"
      >
        <X className="w-5 h-5" />
      </button>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        onClick={e => e.stopPropagation()}
        className="absolute top-4 left-4 text-white/80 hover:text-white bg-black/40 rounded-full p-1.5 transition-colors"
        aria-label="Abrir en nueva pestaña"
      >
        <ArrowUpRight className="w-5 h-5" />
      </a>
      <img
        src={url}
        alt="Vista ampliada"
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
        onClick={e => e.stopPropagation()}
      />
    </div>
  );
}
