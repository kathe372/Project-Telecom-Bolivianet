
import { useState, useEffect, useRef, useCallback } from 'react';

const DEFAULT_MAX_RETRIES    = 2;
const DEFAULT_RETRY_DELAY_MS = 3000;

type Status = 'loading' | 'success' | 'error';

interface UseAsyncSectionOptions {
  maxRetries?:   number;
  retryDelayMs?: number;
  /** Si es false, no dispara el fetch (p.ej. sección oculta por preferencias). */
  enabled?:      boolean;
}

interface UseAsyncSectionResult<T> {
  data:   T | null;
  status: Status;
  retry:  () => void;
}

export function useAsyncSection<T>(
  fetcher: () => Promise<T>,
  options: UseAsyncSectionOptions = {}
): UseAsyncSectionResult<T> {
  const maxRetries   = options.maxRetries   ?? DEFAULT_MAX_RETRIES;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const enabled      = options.enabled      ?? true;
  const [data,   setData]   = useState<T | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  const retryCount  = useRef(0);
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetcherRef  = useRef(fetcher);
  const mountedRef  = useRef(true);

  useEffect(() => { fetcherRef.current = fetcher; }, [fetcher]);

  const load = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    retryCount.current = 0;

    if (mountedRef.current) setStatus('loading');

    const attempt = () => {
      fetcherRef.current()
        .then(result => {
          if (!mountedRef.current) return;
          setData(result);
          setStatus('success');
        })
        .catch(() => {
          if (!mountedRef.current) return;
          if (retryCount.current < maxRetries) {
            retryCount.current++;
            timerRef.current = setTimeout(attempt, retryDelayMs);
          } else {
            setStatus('error');
          }
        });
    };

    attempt();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) load();
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [load, enabled]);

  return { data, status, retry: load };
}
