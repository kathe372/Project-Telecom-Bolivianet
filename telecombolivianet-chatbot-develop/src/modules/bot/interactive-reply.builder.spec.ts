import { InteractiveReplyBuilder } from './interactive-reply.builder';

describe('InteractiveReplyBuilder (MEJORA-1C)', () => {
  let builder: InteractiveReplyBuilder;

  beforeEach(() => {
    builder = new InteractiveReplyBuilder();
  });

  it('arma botones válidos tal cual', () => {
    const out = builder.build('¿Deseas pagar?', [
      { id: 'solicitar_qr', title: '📲 Pagar con QR' },
    ]);
    expect(out).toEqual({
      body: '¿Deseas pagar?',
      buttons: [{ id: 'solicitar_qr', title: '📲 Pagar con QR' }],
    });
  });

  it('recorta a máximo 3 botones (límite Meta)', () => {
    const out = builder.build('elige', [
      { id: 'a', title: 'A' }, { id: 'b', title: 'B' },
      { id: 'c', title: 'C' }, { id: 'd', title: 'D' },
    ]);
    expect(out!.buttons).toHaveLength(3);
  });

  it('trunca títulos a 20 caracteres', () => {
    const out = builder.build('x', [
      { id: 'a', title: 'Este título es demasiado largo para un botón' },
    ]);
    expect(out!.buttons[0].title.length).toBeLessThanOrEqual(20);
    expect(out!.buttons[0].title.endsWith('…')).toBe(true);
  });

  it('trunca el body a 1024 caracteres', () => {
    const out = builder.build('x'.repeat(2000), [{ id: 'a', title: 'A' }]);
    expect(out!.body.length).toBeLessThanOrEqual(1024);
  });

  it('deduplica ids repetidos', () => {
    const out = builder.build('x', [
      { id: 'a', title: 'Primero' }, { id: 'a', title: 'Duplicado' },
    ]);
    expect(out!.buttons).toHaveLength(1);
    expect(out!.buttons[0].title).toBe('Primero');
  });

  it('devuelve null sin botones válidos (llamador degrada a texto)', () => {
    expect(builder.build('x', [])).toBeNull();
    expect(builder.build('x', [{ id: '', title: 'sin id' }])).toBeNull();
    expect(builder.build('x', undefined as any)).toBeNull();
  });

  // ── buildList (PASO 8) ─────────────────────────────────────────────────
  describe('buildList', () => {
    it('arma una lista válida tal cual', () => {
      const out = builder.buildList('Elegí un plan', [
        { title: 'Planes', rows: [{ id: 'plan:1', title: 'Plan Cobre', description: 'Bs.99/mes' }] },
      ], 'Ver planes');
      expect(out).toEqual({
        body: 'Elegí un plan',
        buttonLabel: 'Ver planes',
        sections: [{ title: 'Planes', rows: [{ id: 'plan:1', title: 'Plan Cobre', description: 'Bs.99/mes' }] }],
      });
    });

    it('recorta a máximo 10 filas en total, entre todas las secciones (límite Meta)', () => {
      const rows = Array.from({ length: 12 }, (_, i) => ({ id: `plan:${i}`, title: `Plan ${i}` }));
      const out = builder.buildList('x', [{ title: 'Planes', rows }], 'Ver');
      expect(out!.sections[0].rows).toHaveLength(10);
    });

    it('trunca título de fila a 24 caracteres y descripción a 72', () => {
      const out = builder.buildList('x', [{
        title: 'Planes',
        rows: [{ id: 'a', title: 'x'.repeat(40), description: 'y'.repeat(100) }],
      }], 'Ver');
      expect(out!.sections[0].rows[0].title.length).toBeLessThanOrEqual(24);
      expect(out!.sections[0].rows[0].description!.length).toBeLessThanOrEqual(72);
    });

    it('omite la descripción si no viene (no manda description vacío)', () => {
      const out = builder.buildList('x', [{ title: 'Planes', rows: [{ id: 'a', title: 'A' }] }], 'Ver');
      expect(out!.sections[0].rows[0]).toEqual({ id: 'a', title: 'A' });
    });

    it('deduplica ids repetidos entre secciones', () => {
      const out = builder.buildList('x', [
        { title: 'S1', rows: [{ id: 'a', title: 'Primero' }] },
        { title: 'S2', rows: [{ id: 'a', title: 'Duplicado' }] },
      ], 'Ver');
      const allRows = out!.sections.flatMap((s) => s.rows);
      expect(allRows).toHaveLength(1);
      expect(allRows[0].title).toBe('Primero');
    });

    it('descarta secciones que quedan sin filas válidas', () => {
      const out = builder.buildList('x', [
        { title: 'Vacía', rows: [{ id: '', title: '' }] },
        { title: 'Con datos', rows: [{ id: 'a', title: 'A' }] },
      ], 'Ver');
      expect(out!.sections).toHaveLength(1);
      expect(out!.sections[0].title).toBe('Con datos');
    });

    it('devuelve null sin ninguna fila válida (llamador degrada a texto)', () => {
      expect(builder.buildList('x', [], 'Ver')).toBeNull();
      expect(builder.buildList('x', [{ title: 'S', rows: [] }], 'Ver')).toBeNull();
      expect(builder.buildList('x', undefined as any, 'Ver')).toBeNull();
    });

    it('usa buttonLabel/body/título de sección por defecto si vienen vacíos', () => {
      const out = builder.buildList('', [{ title: '', rows: [{ id: 'a', title: 'A' }] }], '');
      expect(out!.body).toBe('¿Cómo deseas continuar?');
      expect(out!.buttonLabel).toBe('Ver opciones');
      expect(out!.sections[0].title).toBe('Opciones');
    });
  });
});
