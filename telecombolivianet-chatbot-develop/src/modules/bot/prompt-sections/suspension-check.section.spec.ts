import { SuspensionCheckSection } from './suspension-check.section';
import { buildSession } from '../../../test/factories/session.factory';

describe('SuspensionCheckSection', () => {
  const s = new SuspensionCheckSection();

  it('NO aplica a un cliente activo', () => {
    expect(s.applies(buildSession({ clientId: 'C1', clientStatus: 'Activo' }))).toBe(false);
  });

  it('NO aplica a un prospecto (sin clientId)', () => {
    expect(s.applies(buildSession({ clientId: null, clientStatus: 'Suspendido' }))).toBe(false);
  });

  it('aplica a un cliente Suspendido', () => {
    expect(s.applies(buildSession({ clientId: 'C1', clientStatus: 'Suspendido' }))).toBe(true);
  });

  it('render Suspendido → instruye no dar diagnóstico técnico y ofrecer QR', () => {
    const out = s.render(buildSession({ clientId: 'C1', clientStatus: 'Suspendido' }));
    expect(out).toContain('SUSPENDIDO');
    expect(out).toContain('get_client_debt');
    expect(out).toContain('send_payment_qr');
  });

  it('render Cancelado → deriva a administración, sin tickets', () => {
    const out = s.render(buildSession({ clientId: 'C1', clientStatus: 'Cancelado' }));
    expect(out).toContain('administración');
  });
});
