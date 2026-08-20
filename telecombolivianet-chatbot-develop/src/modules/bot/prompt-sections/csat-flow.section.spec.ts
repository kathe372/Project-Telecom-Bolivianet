import { CsatFlowSection, CSAT_VENTANA_MS } from './csat-flow.section';
import { buildSession } from '../../../test/factories/session.factory';

describe('CsatFlowSection', () => {
  const s = new CsatFlowSection();

  it('NO aplica si no hay CSAT pendiente', () => {
    expect(s.applies(buildSession({ pendingCsatTicketId: null }))).toBe(false);
  });

  it('aplica cuando hay un ticket con CSAT pendiente', () => {
    expect(s.applies(buildSession({ pendingCsatTicketId: 'T-1' }))).toBe(true);
  });

  it('render exige llamar update_ticket ANTES de agradecer (fix BUG-1)', () => {
    const out = s.render(buildSession({ pendingCsatTicketId: 'T-1' }));
    expect(out).toContain('update_ticket');
    expect(out).toContain('T-1');
    expect(out.toLowerCase()).toContain('antes de agradecer');
  });
});

// ── FASE G4 (2026-08-07) ──────────────────────────────────────────────────────
// pendingCsatTicketId no caducaba nunca. Si el cliente no calificaba, el bloque
// se inyectaba en TODOS los prompts siguientes con el UUID del ticket cerrado a
// la vista del modelo. Medido en produccion: dos dias despues, al reportar un
// problema NUEVO, el modelo tomo ese UUID viejo del prompt y llamo update_ticket
// con el → HTTP 400 "Un ticket cerrado no puede modificarse".
describe('CsatFlowSection — G4: el CSAT pendiente caduca', () => {
  const section = new CsatFlowSection();
  const sesionCon = (extra: Record<string, unknown>) =>
    ({ pendingCsatTicketId: 'tk-123', ...extra }) as any;

  it('un CSAT recien dejado pendiente sigue aplicando', () => {
    expect(section.applies(sesionCon({ pendingCsatAt: Date.now() }))).toBe(true);
  });

  it('un CSAT viejo deja de aplicar y ya no contamina el prompt', () => {
    const viejo = sesionCon({ pendingCsatAt: Date.now() - (CSAT_VENTANA_MS + 60_000) });
    expect(section.applies(viejo)).toBe(false);
  });

  it('justo dentro de la ventana todavia aplica', () => {
    const borde = sesionCon({ pendingCsatAt: Date.now() - (CSAT_VENTANA_MS - 60_000) });
    expect(section.applies(borde)).toBe(true);
  });

  it('sesiones anteriores al cambio (sin la marca) conservan el comportamiento viejo', () => {
    expect(section.applies(sesionCon({}))).toBe(true);
  });

  it('sin ticket pendiente nunca aplica, tenga o no marca de tiempo', () => {
    expect(section.applies({ pendingCsatTicketId: null, pendingCsatAt: Date.now() } as any)).toBe(false);
  });
});
