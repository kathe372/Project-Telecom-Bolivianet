import { useRef, useState } from 'react';
import { Search, Loader2, MapPin } from 'lucide-react';

interface SearchResult {
  label: string;
  lat:   number;
  lng:   number;
}

/** "lat, lng" pegado directamente (ej. GPS tomado en campo con el celular). */
export function parseCoordinates(text: string): { lat: number; lng: number } | null {
  const m = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(text);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/**
 * Buscador de sectores para el mapa de cobertura (F7):
 * geocodifica con Nominatim (mismo proveedor que el chatbot) restringido a
 * Bolivia, y acepta coordenadas pegadas ("-17.39, -66.15").
 */
export default function MapSearchControl({
  onSelect,
}: {
  onSelect: (lat: number, lng: number, label?: string) => void;
}) {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const search = async () => {
    const q = query.trim();
    if (!q) return;

    const coords = parseCoordinates(q);
    if (coords) {
      setResults([]);
      onSelect(coords.lat, coords.lng, q);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError('');
    try {
      const url = 'https://nominatim.openstreetmap.org/search' +
        `?q=${encodeURIComponent(q)}&format=json&limit=5&countrycodes=bo`;
      const res  = await fetch(url, {
        signal: controller.signal,
        headers: { 'Accept-Language': 'es' },
      });
      const data = (await res.json()) as Array<{
        display_name: string; lat: string; lon: string;
      }>;
      setResults(data.map(r => ({
        label: r.display_name,
        lat:   Number(r.lat),
        lng:   Number(r.lon),
      })));
      if (data.length === 0) setError('Sin resultados. Prueba con coordenadas "lat, lng".');
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError('No se pudo buscar. Verifica tu conexión.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute top-3 left-14 z-[1000] w-72" data-testid="map-search">
      <div className="flex items-center gap-1 bg-white rounded-lg shadow-md border border-gray-200 px-2">
        <Search className="w-4 h-4 text-gray-400 shrink-0" />
        <input
          type="text"
          className="flex-1 py-2 px-1 text-sm focus:outline-none"
          placeholder="Buscar sector o pegar lat, lng…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') search(); }}
        />
        {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
      </div>

      {error && (
        <p className="mt-1 bg-white rounded-lg shadow px-3 py-2 text-xs text-amber-700">{error}</p>
      )}

      {results.length > 0 && (
        <ul className="mt-1 bg-white rounded-lg shadow-md border border-gray-200 divide-y max-h-56 overflow-y-auto">
          {results.map((r, idx) => (
            <li key={idx}>
              <button
                className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 flex items-start gap-2"
                onClick={() => { setResults([]); onSelect(r.lat, r.lng, r.label); }}
              >
                <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                <span className="line-clamp-2">{r.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
