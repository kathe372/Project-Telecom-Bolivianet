import { CoverageMessageResolver } from './coverage-message.resolver';

describe('CoverageMessageResolver', () => {
  let resolver: CoverageMessageResolver;

  beforeEach(() => {
    resolver = new CoverageMessageResolver();
  });

  it('confirmed() incluye las coordenadas', () => {
    const msg = resolver.confirmed(-17.389, -66.156);
    expect(msg).toContain('-17.38900');
    expect(msg).toContain('-66.15600');
  });

  it('noCoverage() no cierra la puerta a futuro (menciona expansión de red)', () => {
    expect(resolver.noCoverage()).toContain('expandamos la red');
  });

  it('unreachable() no culpa al cliente ni inventa un motivo técnico', () => {
    expect(resolver.unreachable()).toContain('agente');
  });

  describe('escalate()', () => {
    it('ZONE_IN_EXPANSION → menciona expansión, no promete fecha', () => {
      const msg = resolver.escalate({ covered: null, escalationReason: 'ZONE_IN_EXPANSION' });
      expect(msg).toContain('expansión');
    });

    it('NO_CAPACITY → menciona que hay cobertura pero falta capacidad', () => {
      const msg = resolver.escalate({ covered: null, escalationReason: 'NO_CAPACITY' });
      expect(msg).toContain('capacidad');
    });

    it('NO_BOXES_REGISTERED → pide verificación técnica', () => {
      const msg = resolver.escalate({ covered: null, escalationReason: 'NO_BOXES_REGISTERED' });
      expect(msg).toContain('verificación técnica');
    });

    it('PASO 11: NEAR_ZONE_BOUNDARY → "cerca", nunca confirma cobertura', () => {
      const msg = resolver.escalate({ covered: null, escalationReason: 'NEAR_ZONE_BOUNDARY' });
      expect(msg).toContain('cerca');
      expect(msg).not.toContain('¡Tenemos cobertura');
    });

    it('PASO 11: NEAR_ZONE_BOUNDARY con nombre de zona lo incluye en el mensaje', () => {
      const msg = resolver.escalate({ covered: null, escalationReason: 'NEAR_ZONE_BOUNDARY', zoneName: 'Zona Norte' });
      expect(msg).toContain('Zona Norte');
    });

    it('motivo desconocido/ausente → mensaje genérico de verificación manual', () => {
      const msg = resolver.escalate({ covered: null });
      expect(msg).toContain('verificación manual');
    });
  });
});
