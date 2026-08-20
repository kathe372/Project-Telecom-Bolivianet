import { useState, useCallback, useEffect } from 'react';
import { invoiceService, type InvoiceTypeFilter } from '@/services/invoiceService';
import type { InvoiceMonthStatsDto, DebtorDto } from '@/types/invoice.types';

interface InvoiceDataState {
  stats:    InvoiceMonthStatsDto | null;
  debtors: DebtorDto[];
  loading:  boolean;
  error:    string;
  reload:   () => void;
}

export function useInvoiceData(
  statsYear:       number,
  statsMonth:      number,
  debouncedSearch: string,
  dateFrom?:       string,
  dateTo?:         string,
  /** Tipo de factura para los totales. Sin valor → todas (mensualidades, extraordinarias,
   *  instalación y prorratas), que es lo realmente facturado en el periodo. */
  type?:           InvoiceTypeFilter,
): InvoiceDataState {
  const [stats,    setStats]    = useState<InvoiceMonthStatsDto | null>(null);
  const [debtors, setDebtors] = useState<DebtorDto[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  const loadData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [statsData, deudoresData] = await Promise.all([
        invoiceService.getStats(statsYear, statsMonth, type),
        invoiceService.getDebtors(debouncedSearch || undefined, dateFrom, dateTo),
      ]);
      setStats(statsData);
      setDebtors(deudoresData);
    } catch {
      setError('Error al cargar los datos.');
    } finally {
      setLoading(false);
    }
  }, [statsYear, statsMonth, debouncedSearch, dateFrom, dateTo, type]);

  useEffect(() => { loadData(); }, [loadData]);

  return { stats, debtors, loading, error, reload: loadData };
}
