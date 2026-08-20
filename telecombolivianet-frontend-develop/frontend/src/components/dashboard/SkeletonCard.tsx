interface ErrorSectionProps { title: string; onRetry: () => void; }

const S = ({ className }: { className: string }) => (
  <div className={`animate-shimmer rounded-md ${className}`} />
);


export function SkeletonKpiCard() {
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <S className="h-2.5 w-20" />
        <S className="h-7 w-7 rounded-lg" />
      </div>
      <S className="h-8 w-24" />
      <S className="h-2.5 w-28" />
    </div>
  );
}

export function SkeletonChart() {
  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <S className="h-4 w-36" />
        <S className="h-4 w-14 rounded-full" />
      </div>
      <div className="flex items-end gap-2 h-36 pt-2">
        {[55, 80, 45, 90, 65, 75, 50, 85].map((h, i) => (
          <div key={i} className="flex-1 animate-shimmer rounded-t-md" style={{ height: `${h}%` }} />
        ))}
      </div>
      <S className="h-2.5 w-48" />
    </div>
  );
}

export function SkeletonTable() {
  return (
    <div className="card overflow-hidden">
      {}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
        <S className="h-4 w-4 rounded" />
        <S className="h-4 w-40" />
      </div>
      {}
      <div className="divide-y divide-gray-50">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-3.5">
            <S className="h-8 w-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <S className="h-3 w-32" />
              <S className="h-2.5 w-20" />
            </div>
            <S className="h-5 w-16 rounded-full" />
            <S className="h-3 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ErrorSection({ title, onRetry }: ErrorSectionProps) {
  return (
    <div className="card p-8 flex flex-col items-center gap-4 text-center">
      <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center ring-1 ring-red-100">
        <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-800">{title}</p>
        <p className="text-xs text-gray-400 mt-1">No se pudo conectar con el servidor.</p>
      </div>
      <button onClick={onRetry} className="btn-secondary text-xs px-4 py-1.5">
        Reintentar
      </button>
    </div>
  );
}
