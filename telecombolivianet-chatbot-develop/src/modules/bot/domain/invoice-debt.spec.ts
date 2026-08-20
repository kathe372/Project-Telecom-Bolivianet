import {
  UNPAID_INVOICE_STATUSES, isUnpaid, outstandingAmount, totalOutstanding,
} from './invoice-debt';

/**
 * REGRESIÓN (auditoría 2026-08-01): el chatbot filtraba `Pendiente | Vencida`,
 * pero el backend entrega el estado efectivo de la factura y una recién generada
 * llega como `Emitida`. Entre la generación (día 1) y el vencimiento (día 5) el
 * bot respondía "no tienes deuda pendiente 🎉" y `send_payment_qr` se negaba a
 * enviar el QR de cobro.
 */
describe('invoice-debt', () => {
  describe('isUnpaid', () => {
    it.each([
      ['Pendiente'],
      ['Emitida'],            // ← el estado que causaba el bug
      ['Enviada'],
      ['Vencida'],
      ['ParcialmentePagada'], // ← saldo remanente que se perdía
    ])('cuenta %s como deuda', (Status) => {
      expect(isUnpaid({ Status, Amount: 100 })).toBe(true);
    });

    it.each([['Pagada'], ['Anulada']])('no cuenta %s como deuda', (Status) => {
      expect(isUnpaid({ Status, Amount: 100 })).toBe(false);
    });

    it('no cuenta un estado desconocido como deuda', () => {
      expect(isUnpaid({ Status: 'EstadoInventado', Amount: 100 })).toBe(false);
    });

    it('mantiene la lista alineada con InvoiceDomainService.UnpaidStatuses del backend', () => {
      expect([...UNPAID_INVOICE_STATUSES].sort()).toEqual(
        ['Emitida', 'Enviada', 'ParcialmentePagada', 'Pendiente', 'Vencida'],
      );
    });
  });

  describe('outstandingAmount', () => {
    it('devuelve el importe completo si no hay abonos', () => {
      expect(outstandingAmount({ Status: 'Emitida', Amount: 149 })).toBe(149);
    });

    it('descuenta lo ya abonado en una ParcialmentePagada', () => {
      expect(outstandingAmount({
        Status: 'ParcialmentePagada', Amount: 149, AmountPaid: 50,
      })).toBe(99);
    });

    it('devuelve 0 para una factura saldada o anulada', () => {
      expect(outstandingAmount({ Status: 'Pagada',  Amount: 149, AmountPaid: 149 })).toBe(0);
      expect(outstandingAmount({ Status: 'Anulada', Amount: 149 })).toBe(0);
    });

    it('nunca devuelve un saldo negativo ante un sobrepago', () => {
      expect(outstandingAmount({
        Status: 'ParcialmentePagada', Amount: 100, AmountPaid: 130,
      })).toBe(0);
    });

    it('tolera que el backend no envíe AmountPaid', () => {
      expect(outstandingAmount({ Status: 'Vencida', Amount: 80 })).toBe(80);
    });
  });

  describe('totalOutstanding', () => {
    it('suma solo el saldo pendiente de cada factura', () => {
      const total = totalOutstanding([
        { Status: 'Emitida',            Amount: 149 },
        { Status: 'ParcialmentePagada', Amount: 149, AmountPaid: 100 },
        { Status: 'Pagada',             Amount: 149, AmountPaid: 149 },
        { Status: 'Anulada',            Amount: 500 },
      ]);
      expect(total).toBe(198); // 149 + 49
    });

    it('devuelve 0 sin facturas', () => {
      expect(totalOutstanding([])).toBe(0);
    });
  });
});
