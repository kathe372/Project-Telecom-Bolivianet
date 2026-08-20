import {
  CheckCircle2, Clock, XCircle, Banknote, Smartphone, Building2,
} from 'lucide-react';

export const MONTH_SHORT = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                            'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export function statusCellClass(status: string) {
  const cls: Record<string, string> = {
    Pendiente: 'bg-amber-50 text-amber-700 border-amber-200',
    Pagada:    'bg-green-50 text-green-700 border-green-200',
    Vencida:   'bg-red-50 text-red-700 border-red-200',
    Anulada:   'bg-gray-100 text-gray-400 border-gray-200',
  };
  return cls[status] ?? 'bg-gray-50 text-gray-400 border-gray-100';
}

export function statusIcon(status: string) {
  if (status === 'Pagada')  return <CheckCircle2 className="w-3 h-3" />;
  if (status === 'Vencida') return <XCircle className="w-3 h-3" />;
  if (status === 'Pendiente') return <Clock className="w-3 h-3" />;
  return null;
}

export function methodIcon(method: string) {
  if (method === 'Efectivo')         return <Banknote className="w-3.5 h-3.5" />;
  if (method === 'QR')               return <Smartphone className="w-3.5 h-3.5" />;
  if (method === 'DepositoBancario') return <Building2 className="w-3.5 h-3.5" />;
  return null;
}

export function methodLabel(method: string) {
  const m: Record<string, string> = {
    Efectivo: 'Efectivo', QR: 'QR', DepositoBancario: 'Depósito',
  };
  return m[method] ?? method;
}

export const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    Activo: 'badge-active', Suspendido: 'badge-blocked', DadoDeBaja: 'badge-inactive',
  };
  const labels: Record<string, string> = {
    Activo: 'Activo', Suspendido: 'Suspendido', DadoDeBaja: 'Dado de baja',
  };
  return <span className={map[s] ?? 'badge-inactive'}>{labels[s] ?? s}</span>;
};

export function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="py-2 flex justify-between text-sm border-b border-gray-50 last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 font-medium text-right max-w-xs">{value ?? '—'}</span>
    </div>
  );
}
