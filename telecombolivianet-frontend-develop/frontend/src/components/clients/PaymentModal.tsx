import { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { registerPaymentWithCredit } from '@/services/paymentService';
import type { InvoiceDto } from '@/types/client.types';
import { extractApiError } from '@/utils/apiError';
import { formatBsAmount } from '@/utils/currency';


const PAYMENT_METHODS = ['Efectivo', 'DepositoBancario', 'QR', 'Transferencia'] as const;

const fmtBs = (v: number) => `Bs ${formatBsAmount(v, 2)}`;

const monthLabel = (year: number, month: number) =>
  new Date(year, month - 1).toLocaleDateString('es-BO', { month: 'long', year: 'numeric' });


interface PaymentModalProps {
  clientId:        string;
  invoices:        InvoiceDto[];
  preselected?:    string;
  onSuccess:       () => void;
  onClose:         () => void;
  receiptId?:      string;
  declaredAmount?: number;
}

export function PaymentModal({
  clientId, invoices, preselected, onSuccess, onClose, receiptId, declaredAmount,
}: PaymentModalProps) {
  const pendingInvoices = invoices.filter(
    (inv) => inv.Status === 'Pendiente' || inv.Status === 'Vencida' ||
             inv.Status === 'Emitida'   || inv.Status === 'Enviada'
  );

  const [selectedIds, setSelectedIds] = useState<string[]>(
    preselected ? [preselected] : receiptId ? [] : pendingInvoices.map(i => i.Id)
  );
  const [method,      setMethod]      = useState<string>('Efectivo');
  const [bank,        setBank]        = useState<string>('');
  const [paidAt,      setPaidAt]      = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [receipt,       setReceipt]       = useState<string>('');
  const [bankReference, setBankReference] = useState<string>('');
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [success,       setSuccess]       = useState(false);

  const [realAmountStr, setRealAmountStr] = useState<string>(
    receiptId && declaredAmount != null ? String(declaredAmount) : ''
  );
  const realAmount = receiptId ? parseFloat(realAmountStr) || 0 : 0;

  useEffect(() => {
    if (preselected) {
      setSelectedIds([preselected]);
    } else if (!receiptId) {
      setSelectedIds(pendingInvoices.map(i => i.Id));
    }
  }, [preselected]);

  const invoiceTotal = pendingInvoices
    .filter((inv) => selectedIds.includes(inv.Id))
    .reduce((sum, inv) => sum + inv.Amount, 0);

  const submitAmount = receiptId ? realAmount : invoiceTotal;

  const amountInsufficient = receiptId && selectedIds.length > 0 && realAmount > 0 && realAmount < invoiceTotal;
  const creditBalance      = receiptId && realAmount > invoiceTotal ? realAmount - invoiceTotal : 0;
  const realAmountMissing  = receiptId && realAmount <= 0;

  const toggleInvoice = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    if (selectedIds.length === 0) { setError('Selecciona al menos una factura.'); return; }
    if (!paidAt)                  { setError('Ingresa la fecha de pago.'); return; }
    if (receiptId && realAmount <= 0) { setError('Ingresa el monto real del comprobante.'); return; }
    if (amountInsufficient) {
      setError(`El monto recibido (${fmtBs(realAmount)}) no cubre las facturas seleccionadas (${fmtBs(invoiceTotal)}).`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const ref = method !== 'Efectivo' ? (bankReference || undefined) : undefined;
      await registerPaymentWithCredit({
        ClientId:              clientId,
        Amount:                submitAmount,
        Method:                method,
        Bank:                  method === 'Efectivo' ? undefined : (bank || undefined),
        PaidAt:                new Date(paidAt).toISOString(),
        InvoiceIds:            selectedIds,
        PhysicalReceiptNumber: receipt || undefined,
        BankReference:         ref,
      });
      setSuccess(true);
      setTimeout(onSuccess, 1000);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Error al registrar el pago. Intente de nuevo.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="payment-modal-title" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }} className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        {}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 id="payment-modal-title" className="text-base font-semibold text-gray-900">Registrar pago</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {success && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Pago registrado correctamente.
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {}
          {receiptId && (
            <div>
              <label className="label">
                Monto real del comprobante
                <span className="text-red-500 ml-0.5">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">Bs.</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="input-field pl-9"
                  placeholder="0.00"
                  value={realAmountStr}
                  onChange={e => setRealAmountStr(e.target.value)}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Verifica el monto en el comprobante y escríbelo aquí.
                {declaredAmount != null && ` El cliente indicó ${fmtBs(declaredAmount)}.`}
              </p>
            </div>
          )}

          {}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">
              Facturas a cubrir
            </p>
            {pendingInvoices.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No hay facturas pendientes.</p>
            ) : (
              <div className="space-y-1.5">
                {pendingInvoices.map((inv) => (
                  <label
                    key={inv.Id}
                    className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 has-[:checked]:border-blue-400 has-[:checked]:bg-blue-50"
                  >
                    <input
                      type="checkbox"
                      className="accent-blue-600"
                      checked={selectedIds.includes(inv.Id)}
                      onChange={() => toggleInvoice(inv.Id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">
                        {inv.Type === 'Instalacion' ? 'Instalación' : monthLabel(inv.Year, inv.Month)}
                      </p>
                      <p className="text-xs text-gray-400">
                        Vence {new Date(inv.DueDate).toLocaleDateString('es-BO')}
                        {' · '}
                        <span className={inv.Status === 'Vencida' ? 'text-red-600 font-medium' : ''}>
                          {inv.Status}
                        </span>
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 shrink-0">
                      {fmtBs(inv.Amount)}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {}
          {receiptId && selectedIds.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg border border-gray-200 text-sm">
                <span className="text-gray-500">Total facturas seleccionadas</span>
                <span className="font-semibold text-gray-700">{fmtBs(invoiceTotal)}</span>
              </div>

              {}
              {amountInsufficient && (
                <div className="flex items-start gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>
                    El monto recibido ({fmtBs(realAmount)}) no cubre el total de las facturas
                    seleccionadas ({fmtBs(invoiceTotal)}). Deselecciona facturas o corrige el monto.
                  </span>
                </div>
              )}

              {}
              {creditBalance > 0 && (
                <div className="flex items-start gap-1.5 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                  <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>
                    El excedente de <strong>{fmtBs(creditBalance)}</strong> se acreditará
                    automáticamente al saldo del cliente.
                  </span>
                </div>
              )}
            </div>
          )}

          {}
          {!receiptId && selectedIds.length > 0 && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50">
              <span className="text-sm font-medium text-blue-700">Total a pagar</span>
              <span className="text-base font-bold text-blue-900">{fmtBs(invoiceTotal)}</span>
            </div>
          )}

          {}
          <div>
            <label className="label">Método de pago</label>
            <select className="input-field" value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {}
          {method !== 'Efectivo' && method !== 'QR' && (
            <div>
              <label className="label">Banco</label>
              <input
                type="text"
                className="input-field"
                value={bank}
                onChange={(e) => setBank(e.target.value)}
                placeholder="Ej: BNB, BCP, Unión..."
              />
            </div>
          )}

          {}
          {method !== 'Efectivo' && (
            <div>
              <label className="label">
                N° de referencia / operación
                <span className="text-gray-400 font-normal"> (opcional)</span>
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="Ej: 0123456789"
                value={bankReference}
                onChange={(e) => setBankReference(e.target.value)}
              />
            </div>
          )}

          {}
          <div>
            <label className="label">Fecha de pago</label>
            <input
              type="date"
              className="input-field"
              value={paidAt}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setPaidAt(e.target.value)}
            />
          </div>

          {}
          <div>
            <label className="label">N° de recibo físico <span className="text-gray-400 font-normal">(opcional)</span></label>
            <input
              type="text"
              className="input-field"
              placeholder="Ej: 000123"
              value={receipt}
              onChange={(e) => setReceipt(e.target.value)}
            />
          </div>
        </div>

        {}
        <div className="flex gap-2 px-5 py-4 border-t border-gray-200">
          <button onClick={onClose} className="btn-secondary flex-1" disabled={loading}>
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            className="btn-primary flex-1"
            disabled={loading || selectedIds.length === 0 || success || !!amountInsufficient || !!realAmountMissing}
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Registrando…</>
              : 'Registrar pago'
            }
          </button>
        </div>
      </div>
    </div>
  );
}
