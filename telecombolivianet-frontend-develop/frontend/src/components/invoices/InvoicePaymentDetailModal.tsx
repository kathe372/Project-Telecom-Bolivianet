import type { InvoiceDetailDto } from '@/types/invoice.types';

const MONTHS = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

interface Props {
  invoice: InvoiceDetailDto;
  onClose: () => void;
}

export function InvoicePaymentDetailModal({ invoice, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="invoice-payment-detail-modal-title" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }} className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 id="invoice-payment-detail-modal-title" className="font-semibold text-gray-900">Detalle del pago</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="px-6 py-5 space-y-3 text-sm">
          {[
            ['Cliente',        `${invoice.ClientName} (${invoice.TbnCode})`],
            ['Período',        `${MONTHS[invoice.Month]} ${invoice.Year}`],
            ['Monto',          `Bs. ${invoice.Amount}`],
            ['Método',         invoice.PaymentMethod ?? '—'],
            ['Banco',          invoice.PaymentBank   ?? '—'],
            ['Fecha de pago',  invoice.PaidAt ? new Date(invoice.PaidAt).toLocaleDateString('es-BO') : '—'],
            ['Registrado por', invoice.PaidByName    ?? '—'],
          ].map(([l, v]) => (
            <div key={l} className="flex justify-between border-b border-gray-50 pb-2 last:border-0">
              <span className="text-gray-500">{l}</span>
              <span className="font-medium text-gray-900 text-right max-w-xs">{v}</span>
            </div>
          ))}
          <button onClick={onClose} className="btn-secondary w-full mt-2">Cerrar</button>
        </div>
      </div>
    </div>
  );
}
