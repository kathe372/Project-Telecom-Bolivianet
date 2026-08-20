import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import type { InvoiceDto, InvoiceGridDto } from '@/types/client.types';
import { formatBs } from '@/utils/currency';
import { MONTH_SHORT, statusCellClass, statusIcon } from './profileHelpers';

function InvoiceCell({
  label, invoice, onClick,
}: {
  label: string;
  invoice: InvoiceDto;
  onClick?: () => void;
}) {
  const canPay = invoice.Status === 'Pendiente' || invoice.Status === 'Vencida';
  return (
    <div
      onClick={canPay ? onClick : undefined}
      title={invoice.Notes ?? undefined}
      className={`rounded-lg border p-2 text-center transition-all
        ${statusCellClass(invoice.Status)}
        ${canPay ? 'cursor-pointer hover:ring-2 hover:ring-blue-400 hover:ring-offset-1' : 'cursor-default'}`}
    >
      <p className="text-xs font-medium leading-none mb-1">{label}</p>
      <div className="flex items-center justify-center gap-0.5 mb-0.5">
        {statusIcon(invoice.Status)}
        <p className="text-xs">{invoice.Status}</p>
      </div>
      <p className="text-xs opacity-75">Bs.{invoice.Amount}</p>
      {invoice.Notes && (
        <p className="text-xs opacity-60 mt-0.5 truncate" title={invoice.Notes}>
          {invoice.Notes}
        </p>
      )}
    </div>
  );
}

export function InvoiceGrid({
  grid, onPayInvoice, year, setYear,
}: {
  grid: InvoiceGridDto;
  onPayInvoice: (invoiceId: string) => void;
  year: number;
  setYear: (y: number) => void;
}) {
  const invoiceByMonth = (month: number) =>
    grid.Invoices.find(i => i.Month === month && i.Year === year && i.Type === 'Mensualidad');
  const installInvoice = grid.Invoices.find(i => i.Type === 'Instalacion');

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setYear(year - 1)}
            className="btn-secondary px-2 py-1 text-xs">◀</button>
          <span className="text-sm font-semibold text-gray-900 w-10 text-center">{year}</span>
          <button onClick={() => setYear(year + 1)}
            disabled={year >= new Date().getFullYear()}
            className="btn-secondary px-2 py-1 text-xs disabled:opacity-40">▶</button>
        </div>
        <div className="flex gap-4 text-xs text-gray-500">
          {grid.TotalDebt > 0 && (
            <span className="text-red-600 font-medium">
              Deuda total: {formatBs(grid.TotalDebt)}
            </span>
          )}
          {grid.PendingMonths > 0 && <span>{grid.PendingMonths} meses pendientes</span>}
          {grid.LastPaymentDate && (
            <span>Último pago: {new Date(grid.LastPaymentDate).toLocaleDateString('es-BO')}</span>
          )}
        </div>
      </div>

      <div className="flex gap-3 text-xs text-gray-400 mb-3 flex-wrap">
        <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-500" /> Pagada</span>
        <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-amber-500" /> Pendiente (dentro del plazo)</span>
        <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-red-500" /> Vencida (mora activa)</span>
        <span className="text-blue-500 ml-auto">Clic en una celda pendiente/vencida para registrar pago</span>
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-13 gap-1.5 mb-4">
        {installInvoice && (
          <InvoiceCell
            label="Inst."
            invoice={installInvoice}
            onClick={() => onPayInvoice(installInvoice.Id)}
          />
        )}
        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
          const inv = invoiceByMonth(m);
          return inv ? (
            <InvoiceCell
              key={m}
              label={MONTH_SHORT[m]}
              invoice={inv}
              onClick={() => onPayInvoice(inv.Id)}
            />
          ) : (
            <div key={m} className="rounded-lg border border-gray-100 bg-gray-50 p-2 text-center">
              <p className="text-xs text-gray-400 font-medium">{MONTH_SHORT[m]}</p>
              <p className="text-xs text-gray-300 mt-0.5">—</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
