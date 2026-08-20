/**
 * Espejo de `InvoiceDomainService.UnpaidStatuses` del backend (C#).
 *
 * El backend expone el estado EFECTIVO de la factura (`InvoiceStatusResolver`),
 * así que una factura recién generada llega como `Emitida` y solo pasa a
 * `Vencida` cuando cruza su fecha de vencimiento.
 *
 * Antes el chatbot filtraba únicamente `Pendiente | Vencida`, de modo que entre
 * la generación (día 1) y el vencimiento (día 5) el bot respondía "no tienes
 * deuda pendiente" y `send_payment_qr` se negaba a enviar el QR de cobro.
 * `ParcialmentePagada` tampoco contaba, así que quien pagaba a medias quedaba
 * con saldo invisible.
 *
 * NOTA DE ARQUITECTURA: esto sigue siendo una regla de negocio duplicada entre
 * servicios. La solución definitiva es que el backend exponga
 * `GET /api/clients/{id}/debt` y el chatbot deje de filtrar por estado
 * (Fase 3 del plan de corrección). Mientras tanto, al menos vive en un único
 * lugar dentro del chatbot.
 */
export const UNPAID_INVOICE_STATUSES: readonly string[] = [
  'Pendiente',
  'Emitida',
  'Enviada',
  'Vencida',
  'ParcialmentePagada',
];

export interface DebtInvoiceLike {
  Status: string;
  Amount: number;
  AmountPaid?: number;
}

/** ¿La factura tiene saldo por cobrar? */
export function isUnpaid(invoice: DebtInvoiceLike): boolean {
  return UNPAID_INVOICE_STATUSES.includes(invoice.Status);
}

/**
 * Saldo realmente pendiente: descuenta lo ya abonado para que una factura
 * parcialmente pagada aporte su remanente y no su total.
 */
export function outstandingAmount(invoice: DebtInvoiceLike): number {
  if (!isUnpaid(invoice)) return 0;
  return Math.max(0, invoice.Amount - (invoice.AmountPaid ?? 0));
}

/** Suma del saldo pendiente de un conjunto de facturas. */
export function totalOutstanding(invoices: readonly DebtInvoiceLike[]): number {
  return invoices.reduce((sum, inv) => sum + outstandingAmount(inv), 0);
}
