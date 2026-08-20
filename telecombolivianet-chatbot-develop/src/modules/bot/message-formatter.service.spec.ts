import { MessageFormatterService } from './message-formatter.service';

describe('MessageFormatterService', () => {
  const fmt = new MessageFormatterService();


  it('welcome: incluye el nombre del cliente', () => {
    const msg = fmt.welcome('Juan Pérez');
    expect(msg).toContain('Juan Pérez');
  });

  it('welcomeProspect: menciona opciones para prospecto', () => {
    expect(fmt.welcomeProspect()).toContain('Información sobre nuestros planes');
  });

  it('debtSummary: sin deuda → mensaje de al día', () => {
    const msg = fmt.debtSummary('Ana', []);
    expect(msg).toContain('al día');
  });

  it('debtSummary: con facturas → incluye monto total', () => {
    const msg = fmt.debtSummary('Ana', [
      { Id: '1', Month: 5, Year: 2026, Amount: 100, DueDate: '', Status: 'Pendiente', PaidAt: null },
      { Id: '2', Month: 6, Year: 2026, Amount: 150, DueDate: '', Status: 'Vencida',  PaidAt: null },
    ]);
    expect(msg).toContain('250.00');
    expect(msg).toContain('VENCIDA');
  });

  it('qrInstruction: incluye tbnCode y monto', () => {
    const msg = fmt.qrInstruction('Carlos', 'TBN-00123', 200);
    expect(msg).toContain('TBN-00123');
    expect(msg).toContain('200.00');
  });

  it('ticketCreated: incluye número de ticket y prioridad', () => {
    const msg = fmt.ticketCreated('Luis', 'abc12345', 'Alta');
    expect(msg).toContain('ABC12345');
    expect(msg).toContain('Alta');
  });

  it('botResumed: devuelve string no vacío', () => {
    expect(fmt.botResumed().length).toBeGreaterThan(10);
  });

  it('escalationNotice: menciona agente humano', () => {
    expect(fmt.escalationNotice()).toContain('agente humano');
  });

  it('fallbackMenu: devuelve menú con 6 opciones', () => {
    const msg = fmt.fallbackMenu();
    expect(msg).toContain('1️⃣');
    expect(msg).toContain('6️⃣');
  });

  it('installationConfirmed: incluye fecha, hora y dirección', () => {
    const msg = fmt.installationConfirmed('2026-06-15', '09:00', 'Av. Principal 123');
    expect(msg).toContain('2026-06-15');
    expect(msg).toContain('09:00');
    expect(msg).toContain('Av. Principal 123');
  });

  describe('estado del periodo de pago (buildPaymentPeriodStatus) — todas las ramas', () => {
    it('día 3 → dentro del periodo, quedan días', () => {
      expect(fmt.paymentPeriodInfo(3)).toContain('Quedan');
    });
    it('día 5 → último día para pagar', () => {
      expect(fmt.paymentPeriodInfo(5)).toContain('último día');
    });
    it('día 6 → pasan a Vencida hoy', () => {
      expect(fmt.paymentPeriodInfo(6)).toContain('Vencida');
    });
    it('día 7 → recordatorio automático', () => {
      expect(fmt.paymentPeriodInfo(7)).toContain('recordatorio');
    });
    it('día 15 → periodo venció', () => {
      expect(fmt.paymentPeriodInfo(15)).toContain('venció');
    });
  });

  describe('paymentPeriodWithDebt', () => {
    it('sin facturas → "al día"', () => {
      expect(fmt.paymentPeriodWithDebt('Ana', [], 3)).toContain('al día');
    });
    it('con vencidas → recomienda pagar a la brevedad', () => {
      const msg = fmt.paymentPeriodWithDebt('Ana', [
        { Id: '1', Month: 6, Year: 2026, Amount: 149, DueDate: '', Status: 'Vencida', PaidAt: null } as any,
      ], 8);
      expect(msg).toContain('vencidas');
      expect(msg).toContain('149.00');
    });
  });

  describe('slotsAvailable', () => {
    it('sin slots → mensaje de no disponibilidad', () => {
      expect(fmt.slotsAvailable([])).toContain('no hay horarios');
    });
    it('agrupa slots por día con el nombre del día', () => {
      const msg = fmt.slotsAvailable([
        { Fecha: '2026-07-20', HoraInicio: '09:00' } as any,
        { Fecha: '2026-07-20', HoraInicio: '10:00' } as any,
      ]);
      expect(msg).toContain('Lunes 2026-07-20');
      expect(msg).toContain('09:00');
      expect(msg).toContain('10:00');
    });
  });

  it('plansList: lista cada plan con velocidades y precio', () => {
    const msg = fmt.plansList([
      { Name: 'Plan Oro', DownloadSpeedMbps: 80, UploadSpeedMbps: 40, PriceMonthly: 199 } as any,
    ]);
    expect(msg).toContain('Plan Oro');
    expect(msg).toContain('80 Mbps');
    expect(msg).toContain('199');
  });

  it('suspended: menciona suspensión y ofrece QR', () => {
    expect(fmt.suspended('Ana')).toContain('suspendido');
  });

  it('agentTookOver: incluye el nombre del agente', () => {
    expect(fmt.agentTookOver('Carlos')).toContain('Carlos');
  });
});
