import { InteractiveIdCodec } from './interactive-id.codec';

describe('InteractiveIdCodec (PASO 8)', () => {
  let codec: InteractiveIdCodec;

  beforeEach(() => {
    codec = new InteractiveIdCodec();
  });

  it('encodePlan/decode son inversos', () => {
    const encoded = codec.encodePlan('9f2a1c3b-4d5e-6f70-8192-a3b4c5d6e7f8');
    expect(codec.decode(encoded)).toEqual({
      kind: 'plan',
      planId: '9f2a1c3b-4d5e-6f70-8192-a3b4c5d6e7f8',
    });
  });

  it('encodeSlot/decode son inversos', () => {
    const encoded = codec.encodeSlot('2026-08-06', '09:00');
    expect(codec.decode(encoded)).toEqual({
      kind: 'slot',
      date: '2026-08-06',
      time: '09:00',
    });
  });

  it('id sin prefijo reconocido → static, con el id intacto (retrocompatible)', () => {
    expect(codec.decode('menu')).toEqual({ kind: 'static', id: 'menu' });
    expect(codec.decode('solicitar_qr')).toEqual({ kind: 'static', id: 'solicitar_qr' });
  });

  it('id vacío o inválido no lanza excepción → static', () => {
    expect(codec.decode('')).toEqual({ kind: 'static', id: '' });
    expect(() => codec.decode(undefined as any)).not.toThrow();
    expect(codec.decode(undefined as any)).toEqual({ kind: 'static', id: '' });
  });

  it('"plan:" sin payload → static, no un plan vacío', () => {
    expect(codec.decode('plan:')).toEqual({ kind: 'static', id: 'plan:' });
  });

  it('"slot:" con partes faltantes → static, no un slot incompleto', () => {
    expect(codec.decode('slot:2026-08-06')).toEqual({ kind: 'static', id: 'slot:2026-08-06' });
    expect(codec.decode('slot:')).toEqual({ kind: 'static', id: 'slot:' });
  });

  it('encodeAccount/decode son inversos', () => {
    const encoded = codec.encodeAccount('c1a2b3c4-0000-0000-0000-000000000001');
    expect(codec.decode(encoded)).toEqual({
      kind: 'account',
      clientId: 'c1a2b3c4-0000-0000-0000-000000000001',
    });
  });

  it('"account:" sin payload → static, no un account vacío', () => {
    expect(codec.decode('account:')).toEqual({ kind: 'static', id: 'account:' });
  });

  it('un UUID con guiones dentro de plan: se preserva completo', () => {
    // el UUID no lleva ':' así que rest.join(':') no lo altera, pero se
    // prueba explícito para dejar constancia del contrato.
    expect(codec.decode('plan:00000000-0000-0000-0001-000000000002')).toEqual({
      kind: 'plan',
      planId: '00000000-0000-0000-0001-000000000002',
    });
  });

  // 2026-08-07: la calificación llegaba como texto libre y el modelo
  // interpretaba cualquier número del 1 al 5 durante las 2 horas siguientes al
  // cierre del ticket. Un "5" contestando "¿cuántos dispositivos tenés?"
  // quedaba registrado como 5/5.
  describe('csat', () => {
    it('codifica y decodifica la nota', () => {
      expect(codec.encodeCsat(4)).toBe('csat:4');
      expect(codec.decode('csat:4')).toEqual({ kind: 'csat', score: 4 });
    });

    it.each([1, 2, 3, 4, 5])('acepta la nota %i', (n) => {
      expect(codec.decode(`csat:${n}`)).toEqual({ kind: 'csat', score: n });
    });

    // Antes que inventar una nota, se deja caer a 'static' y no se registra nada.
    it.each(['csat:0', 'csat:6', 'csat:-1', 'csat:4.5', 'csat:abc', 'csat:'])(
      'no inventa una calificación con %s',
      (raw) => {
        expect(codec.decode(raw).kind).toBe('static');
      },
    );
  });

});
