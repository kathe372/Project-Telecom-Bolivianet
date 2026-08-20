import { useState, useEffect, useCallback } from 'react';
import { coverageService } from '@/services/coverageService';
import { extractApiError } from '@/utils/apiError';
import type { NapPort } from '@/types/coverage';

/**
 * PR-4b: carga los puertos de una caja y expone las acciones dañar/reparar.
 * SRP: solo datos + acciones (la presentación vive en los componentes).
 */
export function useBoxPorts(boxId: string) {
  const [ports,   setPorts]   = useState<NapPort[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setPorts(await coverageService.getBoxPorts(boxId));
    } catch (e) {
      setError(extractApiError(e, 'No se pudieron cargar los puertos.'));
    } finally {
      setLoading(false);
    }
  }, [boxId]);

  useEffect(() => { refresh(); }, [refresh]);

  const damage = useCallback(
    async (numero: number) => { await coverageService.damagePort(boxId, numero); await refresh(); },
    [boxId, refresh],
  );

  const repair = useCallback(
    async (numero: number) => { await coverageService.repairPort(boxId, numero); await refresh(); },
    [boxId, refresh],
  );

  return { ports, loading, error, refresh, damage, repair };
}
