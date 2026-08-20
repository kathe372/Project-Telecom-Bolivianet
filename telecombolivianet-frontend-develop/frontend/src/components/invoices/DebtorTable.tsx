import { useState } from 'react';
import {
  AlertTriangle, Clock, ChevronDown, ChevronUp, CreditCard, CheckCircle,
} from 'lucide-react';
import { MONTHS, fmtBsDec, diasMora } from '@/utils/invoiceFormatters';
import {
  INVOICE_STATUS_COLORS, INVOICE_STATUS_LABELS,
  type InvoiceStatus,
} from '@/services/invoiceService';
import type { DebtorDto, InvoicePendienteDto } from '@/types/invoice.types';

function statusBadge(s: string) {
  const color = INVOICE_STATUS_COLORS[s as InvoiceStatus] ?? 'bg-gray-100 text-gray-600 border-gray-200';
  const label = INVOICE_STATUS_LABELS[s as InvoiceStatus] ?? s;
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${color}`}>
      {label}
    </span>
  );
}

function InvoiceDetail({ factura }: { factura: InvoicePendienteDto }) {
  const mora = diasMora(factura.DueDate);
  return (
    <div className="flex items-center gap-4 px-3 py-2 bg-white rounded-lg border border-gray-100 text-sm">
      <span className="font-mono text-xs text-indigo-600 w-28 shrink-0">
        {factura.InvoiceNumber}
      </span>
      <span className="text-gray-700 w-28 shrink-0">
        {factura.Month === 0
          ? 'Instalación'
          : `${MONTHS[factura.Month]} ${factura.Year}`}
      </span>
      <span className="font-semibold text-gray-900 w-24 shrink-0">
        {fmtBsDec(factura.Amount)}
      </span>
      <span className="shrink-0">{statusBadge(factura.Status)}</span>
      <span className="text-xs text-gray-400 shrink-0">
        Vence {new Date(factura.DueDate).toLocaleDateString('es-BO')}
      </span>
      {mora > 0 && (
        <span className="text-xs font-medium text-red-500 shrink-0">
          {mora} días de mora
        </span>
      )}
      {factura.Notes && (
        <span className="text-xs text-gray-400 truncate">{factura.Notes}</span>
      )}
    </div>
  );
}

function DebtorRow({ deudor, onPagar }: {
  deudor: DebtorDto;
  onPagar: (deudor: DebtorDto) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const overdue   = deudor.Facturas.filter(f => f.Status === 'Vencida');
  const pendientes = deudor.Facturas.filter(
    f => f.Status === 'Pendiente' || f.Status === 'Emitida' || f.Status === 'Enviada'
  );
  const maxMora = overdue.length > 0
    ? Math.max(...overdue.map(f => diasMora(f.DueDate)))
    : 0;

  return (
    <>
      <tr className={`transition-colors ${expanded ? 'bg-blue-50/60' : 'hover:bg-gray-50'}`}>
        <td className="px-4 py-3">
          <div className="flex flex-col">
            <span className="font-mono text-xs font-bold text-blue-700 mb-0.5">
              {deudor.TbnCode}
            </span>
            <span className="font-semibold text-gray-900 text-sm leading-tight">
              {deudor.FullName}
            </span>
            <span className="text-xs text-gray-400 mt-0.5">
              {deudor.PlanName} · {deudor.Zone}
            </span>
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-col gap-1">
            {overdue.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200 w-fit">
                <AlertTriangle className="w-3 h-3" />
                {overdue.length} vencida{overdue.length > 1 ? 's' : ''}
              </span>
            )}
            {pendientes.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 w-fit">
                <Clock className="w-3 h-3" />
                {pendientes.length} pendiente{pendientes.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3">
          {maxMora > 0 ? (
            <span className={`text-sm font-semibold ${maxMora > 60 ? 'text-red-600' : maxMora > 30 ? 'text-orange-500' : 'text-amber-600'}`}>
              {maxMora} días
            </span>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
        </td>
        <td className="px-4 py-3">
          <span className="text-base font-bold text-gray-900">
            {fmtBsDec(deudor.TotalDeuda)}
          </span>
        </td>
        <td className="px-4 py-3 text-xs text-gray-500">
          {new Date(deudor.UltimoVencimiento).toLocaleDateString('es-BO')}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPagar(deudor)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
            >
              <CreditCard className="w-3.5 h-3.5" /> Pagar
            </button>
            <button
              onClick={() => setExpanded(e => !e)}
              title={expanded ? 'Ocultar facturas' : 'Ver facturas'}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="px-0 py-0 border-b border-blue-100 bg-blue-50/40">
            <div className="px-6 py-3 space-y-1.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Facturas pendientes de pago
              </p>
              {deudor.Facturas.map(f => (
                <InvoiceDetail key={f.Id} factura={f} />
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

interface DebtorTableProps {
  debtors: DebtorDto[];
  onPagar:  (deudor: DebtorDto) => void;
}

export function DebtorTable({ debtors, onPagar }: DebtorTableProps) {
  if (debtors.length === 0) {
    return (
      <div className="card p-12 text-center">
        <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-400" />
        <p className="font-semibold text-gray-600">Sin facturas pendientes</p>
        <p className="text-sm text-gray-400 mt-1">Todos los clientes están al día.</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {['Cliente / Plan / Zona', 'Facturas', 'Mora', 'Deuda total', 'Último venc.', 'Acciones'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {debtors.map(d => (
              <DebtorRow key={d.ClientId} deudor={d} onPagar={onPagar} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
