import { PreviousContextSection } from './previous-context.section';
import { SessionData } from '../../session/session.service';

const session = (partial: Partial<SessionData>): SessionData => ({
  phoneNumber: '591X', clientId: null, clientName: null, clientStatus: null,
  planId: null, planName: null, totalDebt: 0, tbnCode: null,
  activeTicketId: null, activeInstallationId: null, pendingAction: null,
  pendingTechIssue: null, pendingCsatTicketId: null, isEscalated: false,
  lastSentiment: 'neutral', angryCount: 0,
  lastLocation: null, pendingImageId: null, pendingImageCaption: null,
  previousSummary: null, previousSummaryAt: null, messages: [], ...partial,
});

describe('PreviousContextSection (MEJORA-1D)', () => {
  let section: PreviousContextSection;

  beforeEach(() => {
    section = new PreviousContextSection();
  });

  it('NO aplica sin resumen previo', () => {
    expect(section.applies(session({}))).toBe(false);
    expect(section.applies(session({ previousSummary: '   ' }))).toBe(false);
  });

  it('aplica con resumen previo', () => {
    expect(section.applies(session({ previousSummary: 'Cliente reportó internet lento.' }))).toBe(true);
  });

  it('renderiza el resumen con antigüedad en días', () => {
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const out = section.render(session({
      previousSummary: 'Cliente reportó internet lento; se creó ticket.',
      previousSummaryAt: threeDaysAgo,
    }));
    expect(out).toContain('CONVERSACIÓN ANTERIOR (hace 3 días)');
    expect(out).toContain('internet lento');
    expect(out).toContain('NO menciones el tema anterior por iniciativa propia');
  });

  it('usa "ayer" y "hoy" para antigüedades cortas', () => {
    const ayer = section.render(session({
      previousSummary: 'x', previousSummaryAt: Date.now() - 25 * 60 * 60 * 1000,
    }));
    expect(ayer).toContain('(ayer)');
    const hoy = section.render(session({
      previousSummary: 'x', previousSummaryAt: Date.now() - 60 * 60 * 1000,
    }));
    expect(hoy).toContain('(hoy)');
  });

  it('instruye verificar el estado real con herramientas', () => {
    const out = section.render(session({ previousSummary: 'x', previousSummaryAt: Date.now() }));
    expect(out).toContain('verifica el estado real');
  });
});
