import { FirstContactPolicy } from './first-contact.policy';
import { MessageContext } from './message-context';

const ctx = (partial: Partial<MessageContext>): MessageContext => ({
  phone: '591X', messageId: 'm1', type: 'text', humanAvailable: true, ...partial,
});

describe('FirstContactPolicy (BUG-4)', () => {
  let policy: FirstContactPolicy;

  beforeEach(() => {
    policy = new FirstContactPolicy();
  });

  it('la ubicación GPS como primer mensaje ES accionable', () => {
    expect(policy.hasActionableContent(ctx({ type: 'location', locationLat: -16.5, locationLng: -68.1 }))).toBe(true);
  });

  it('imagen y audio como primer mensaje SON accionables', () => {
    expect(policy.hasActionableContent(ctx({ type: 'image', imageId: 'img1' }))).toBe(true);
    expect(policy.hasActionableContent(ctx({ type: 'audio', audioId: 'aud1' }))).toBe(true);
  });

  it('una consulta real como primer mensaje ES accionable', () => {
    expect(policy.hasActionableContent(ctx({ text: 'quiero contratar internet para mi casa' }))).toBe(true);
    expect(policy.hasActionableContent(ctx({ text: 'no tengo internet desde ayer' }))).toBe(true);
    expect(policy.hasActionableContent(ctx({ text: 'cuánto debo?' }))).toBe(true);
  });

  it('un saludo simple NO es accionable (solo bienvenida)', () => {
    for (const saludo of ['hola', 'Hola!', 'buenas', 'Buenas tardes', 'hey', 'buen día', 'hola 👋']) {
      expect(policy.hasActionableContent(ctx({ text: saludo }))).toBe(false);
    }
  });

  it('texto vacío NO es accionable', () => {
    expect(policy.hasActionableContent(ctx({ text: '   ' }))).toBe(false);
    expect(policy.hasActionableContent(ctx({ text: undefined }))).toBe(false);
  });

  // PASO 6B: isBareGreeting — misma detección de saludo, pero utilizable en
  // cualquier punto de la conversación, no solo en el primer contacto.
  describe('isBareGreeting (PASO 6B)', () => {
    it('un saludo simple ES un saludo suelto', () => {
      for (const saludo of ['hola', 'Hola!', 'buenas', 'Buenas tardes', 'hey', 'buen día', 'hola 👋']) {
        expect(policy.isBareGreeting(ctx({ text: saludo }))).toBe(true);
      }
    });

    it('una consulta real NO es un saludo suelto', () => {
      expect(policy.isBareGreeting(ctx({ text: 'quiero contratar internet' }))).toBe(false);
      expect(policy.isBareGreeting(ctx({ text: 'cuánto debo?' }))).toBe(false);
    });

    it('texto vacío NO es un saludo suelto', () => {
      expect(policy.isBareGreeting(ctx({ text: '   ' }))).toBe(false);
      expect(policy.isBareGreeting(ctx({ text: undefined }))).toBe(false);
    });

    it('ubicación/imagen/audio NUNCA son saludo suelto, aunque no traigan texto', () => {
      expect(policy.isBareGreeting(ctx({ type: 'location', locationLat: -16.5, locationLng: -68.1 }))).toBe(false);
      expect(policy.isBareGreeting(ctx({ type: 'image', imageId: 'img1' }))).toBe(false);
      expect(policy.isBareGreeting(ctx({ type: 'audio', audioId: 'aud1' }))).toBe(false);
    });
  });
});
