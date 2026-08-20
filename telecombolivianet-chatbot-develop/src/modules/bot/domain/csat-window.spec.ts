import { CSAT_VENTANA_MS, pendingCsatVigente } from './csat-window';

/**
 * Fallo real (2026-08-07): la caducidad del CSAT se implemento primero solo en
 * la seccion del prompt. Verificado en produccion envejeciendo la marca a
 * proposito: el bloque dejo de inyectarse (el modelo llamo update_ticket SIN
 * ticket_id), pero la herramienta lo relleno sola leyendo la sesion en crudo.
 * Gatear la superficie visible no sirve si el dato sigue accesible por detras.
 */
describe('pendingCsatVigente', () => {
  const conCsat = (extra: Record<string, unknown> = {}) =>
    ({ pendingCsatTicketId: 'tk-1', ...extra }) as any;

  it('devuelve el ticket si la calificacion es reciente', () => {
    expect(pendingCsatVigente(conCsat({ pendingCsatAt: Date.now() }))).toBe('tk-1');
  });

  it('lo descarta pasada la ventana', () => {
    const viejo = conCsat({ pendingCsatAt: Date.now() - (CSAT_VENTANA_MS + 60_000) });
    expect(pendingCsatVigente(viejo)).toBeNull();
  });

  it('justo dentro de la ventana sigue vigente', () => {
    const borde = conCsat({ pendingCsatAt: Date.now() - (CSAT_VENTANA_MS - 60_000) });
    expect(pendingCsatVigente(borde)).toBe('tk-1');
  });

  it('sesiones anteriores al cambio (sin marca) conservan el comportamiento previo', () => {
    expect(pendingCsatVigente(conCsat())).toBe('tk-1');
  });

  it('sin ticket pendiente devuelve null aunque haya marca', () => {
    expect(pendingCsatVigente({ pendingCsatTicketId: null, pendingCsatAt: Date.now() } as any)).toBeNull();
  });
});
