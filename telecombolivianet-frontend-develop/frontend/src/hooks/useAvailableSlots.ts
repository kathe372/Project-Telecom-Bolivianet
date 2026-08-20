import { useState, useEffect } from 'react';
import { getAvailableSlots } from '@/services/installationService';
import type { SlotDisponible } from '@/types/installation.types';

/** Punto 8: carga las franjas disponibles al elegir un plan. */
export function useAvailableSlots(planId: string, dias = 14) {
  const [slots,   setSlots]   = useState<SlotDisponible[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!planId) { setSlots([]); return; }
    setLoading(true);
    getAvailableSlots({ planId, dias })
      .then(setSlots)
      .catch(() => setSlots([]))
      .finally(() => setLoading(false));
  }, [planId, dias]);

  return { slots, loading };
}
