import { InstallationFlowSection } from './installation-flow.section';
import type { SessionData } from '../../session/session.service';

const makeSession = (overrides: Partial<SessionData> = {}): SessionData => ({
  phoneNumber: '59171000000',
  clientId: null, clientName: null, clientStatus: null,
  planId: null, planName: null, totalDebt: 0, tbnCode: null,
  activeTicketId: null, activeInstallationId: null,
  pendingAction: null, pendingTechIssue: null, pendingCsatTicketId: null,
  isEscalated: false, lastSentiment: 'neutral', angryCount: 0,
  lastLocation: null, locationCapturedAt: null, locationSource: null,
  pendingImageId: null, pendingImageCaption: null,
  messages: [],
  ...overrides,
});

describe('InstallationFlowSection (PASO 12)', () => {
  const section = new InstallationFlowSection();

  it('applies siempre', () => {
    expect(section.applies(makeSession())).toBe(true);
  });

  it('usa get_installation_plans, no get_available_plans, para el flujo de instalación', () => {
    const text = section.render(makeSession());
    expect(text).toContain('get_installation_plans');
    expect(text).toMatch(/NO get_available_plans/);
  });

  it('exige nombre y CI del prospecto antes de agendar', () => {
    const text = section.render(makeSession());
    expect(text).toContain('ci_prospecto');
    expect(text).toContain('nombre_contacto');
    expect(text).toContain('OBLIGATORIOS');
  });

  it('instruye la confirmación en dos pasos — nunca confirmado=true en el mismo turno del horario', () => {
    const text = section.render(makeSession());
    expect(text).toContain('confirmado=false');
    expect(text).toContain('confirmado=true');
    expect(text).toMatch(/NUNCA.*mismo turno/s);
  });

  it('no menciona costo de instalación (PASO 9 descartado)', () => {
    const text = section.render(makeSession());
    expect(text.toLowerCase()).not.toContain('costo de instalación');
  });

  it('incluye el bloque de instalación activa cuando la sesión tiene una', () => {
    const text = section.render(makeSession({ activeInstallationId: 'inst-1' }));
    expect(text).toContain('INSTALACIÓN ACTIVA');
    expect(text).toContain('inst-1');
  });

  it('PASO 13: instruye confirmación en dos pasos para cancelar y reprogramar', () => {
    const text = section.render(makeSession({ activeInstallationId: 'inst-1' }));
    expect(text).toMatch(/cancel_installation.*SIN confirmado/s);
    expect(text).toMatch(/reschedule_installation.*SIN confirmado/s);
    expect(text).toContain('confirmado=true');
    expect(text).toMatch(/NUNCA.*confirmado=true.*mismo\s*\n?\s*turno/s);
  });

  it('no incluye el bloque de instalación activa sin una en sesión', () => {
    const text = section.render(makeSession());
    expect(text).not.toContain('INSTALACIÓN ACTIVA');
  });
});
