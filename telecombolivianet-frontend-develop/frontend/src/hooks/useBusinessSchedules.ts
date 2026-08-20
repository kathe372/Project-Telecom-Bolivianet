import { useState, useEffect, useCallback } from 'react';
import { businessScheduleService } from '@/services/businessScheduleService';
import { extractApiError } from '@/utils/apiError';
import type { BusinessSchedule } from '@/types/businessSchedule';

/** Punto 1: carga los horarios de negocio (con sus feriados). */
export function useBusinessSchedules() {
  const [schedules, setSchedules] = useState<BusinessSchedule[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSchedules(await businessScheduleService.getAll());
    } catch (e) {
      setError(extractApiError(e, 'No se pudieron cargar los horarios.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { schedules, loading, error, refresh };
}
