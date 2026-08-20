export const MONTHS = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

import { formatBs } from '@/utils/currency';

export const fmtBsDec = (v: number) => formatBs(v, 2);

export const diasMora = (dueDateStr: string): number => {
  const diff = Math.floor(
    (Date.now() - new Date(dueDateStr).getTime()) / 86_400_000
  );
  return diff > 0 ? diff : 0;
};
