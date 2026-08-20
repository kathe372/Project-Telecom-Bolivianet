import { InteractiveIntentMapperService } from './interactive-intent-mapper.service';
import { DEFAULT_INTENT_MAP } from './intent-map.config';

describe('InteractiveIntentMapperService', () => {
  const mapper = new InteractiveIntentMapperService(DEFAULT_INTENT_MAP);

  it('resuelve un id de botón conocido a su frase', () => {
    expect(mapper.resolve('consulta_deuda')).toContain('deuda');
    expect(mapper.resolve('solicitar_qr')).toContain('QR');
  });

  it('los botones nuevos de MEJORA-1C están mapeados', () => {
    expect(mapper.resolve('problema_resuelto')).toContain('resolvió');
    expect(mapper.resolve('problema_persiste')).toContain('persiste');
  });

  it('id desconocido → undefined', () => {
    expect(mapper.resolve('no_existe_xyz')).toBeUndefined();
  });

  it('consulta_planes NO menciona "cobertura" (evita que el agente pida ubicación en vez de mostrar planes)', () => {
    expect(mapper.resolve('consulta_planes')).not.toMatch(/cobertura/i);
  });
});
