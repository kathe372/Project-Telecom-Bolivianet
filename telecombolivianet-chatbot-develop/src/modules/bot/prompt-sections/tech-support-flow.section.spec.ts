import { TechSupportFlowSection } from './tech-support-flow.section';
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

describe('TechSupportFlowSection (PASO 16 Fase A/B/C)', () => {
  const section = new TechSupportFlowSection();

  it('applies siempre', () => {
    expect(section.applies(makeSession())).toBe(true);
  });

  it('instruye llamar check_recurring_issue antes de search_knowledge_base', () => {
    const text = section.render(makeSession());
    expect(text).toMatch(/check_recurring_issue[\s\S]*search_knowledge_base/);
  });

  it('instruye saltar autodiagnóstico cuando recurrent:true', () => {
    const text = section.render(makeSession());
    expect(text).toMatch(/recurrent:true[\s\S]*NO[\s\S]*ofrezcas pasos de[\s\S]*autodiagnóstico/);
  });

  it('instruye detectar indicio de fibra cortada por luz roja del router', () => {
    const text = section.render(makeSession());
    expect(text).toContain('luz/foco');
    expect(text).toContain('cable_cortado');
    expect(text).toMatch(/NO llames search_knowledge_base/);
  });

  it('no menciona números de horas de SLA fijos (deben venir del backend, no hardcodeados)', () => {
    const text = section.render(makeSession());
    expect(text).not.toMatch(/\d+h SLA/);
    expect(text).not.toMatch(/\d+-\d+h/);
  });

  it('mantiene la instrucción de cierre obligatorio', () => {
    const text = section.render(makeSession());
    expect(text).toContain('close_support_ticket');
  });

  it('instruye ofrecer visita técnica (get_ticket_visit_slots + schedule_ticket_visit) en los casos recurrente y fibra cortada', () => {
    const text = section.render(makeSession());
    expect(text).toContain('get_ticket_visit_slots');
    expect(text).toContain('schedule_ticket_visit');
    expect(text).toMatch(/cable_cortado[\s\S]*OFRECER VISITA TÉCNICA/);
  });

  it('NO ofrece visita técnica automáticamente en el caso normal (primera vez)', () => {
    const text = section.render(makeSession());
    expect(text).toMatch(/NO ofrezcas visita[\s\S]*técnica automáticamente en este caso/);
  });

  it('el ofrecimiento de visita también aplica al caso de ticket existente (existingTicketId)', () => {
    const text = section.render(makeSession());
    expect(text).toContain('existingTicketId');
  });
});
