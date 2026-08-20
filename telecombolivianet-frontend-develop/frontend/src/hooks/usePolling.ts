import { useEffect } from 'react';

export function usePolling(fn: () => Promise<void>, intervalMs: number): void {
  useEffect(() => {
    let active    = true;
    let timeoutId: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (!active) return;
      await fn().catch(console.error);
      if (active) timeoutId = setTimeout(tick, intervalMs);
    };

    timeoutId = setTimeout(tick, intervalMs);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [fn, intervalMs]);
}
