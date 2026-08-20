import { sinCanalesFueraDeBanda } from './agent-tool-registry.service';

/**
 * Medido en producción (2026-08-07): el cliente recibió, pegado debajo del
 * texto, el JSON crudo de la lista interactiva:
 *
 *   Ahora elegí el plan que más te interese:
 *   {"buttonLabel": "Ver planes", "sections": [{"rows": [{"description": ...
 *
 * Pasó dos veces en el mismo alta —planes y horarios— y en las dos el cliente
 * ESCRIBIÓ la respuesta a mano ("COBRE", "A las 15:30") en vez de tocar la
 * opción. Los turnos que no pasan por el modelo (el menú, los horarios al
 * reprogramar) salieron limpios: es el modelo copiando lo que ve.
 */
describe('sinCanalesFueraDeBanda', () => {
  const LISTA = { buttonLabel: 'Ver planes', sections: [{ title: 'Planes', rows: [] }] };

  it('quita la lista interactiva y deja el contenido', () => {
    const limpio = sinCanalesFueraDeBanda({
      covered: 'true',
      planes: [{ Name: 'COBRE', MonthlyPrice: 89 }],
      _list: LISTA,
    }) as Record<string, unknown>;

    expect(limpio['_list']).toBeUndefined();
    // Lo que el modelo SÍ necesita para redactar sigue estando: sacarle el
    // canal de transporte no puede dejarlo sin los datos.
    expect(limpio['covered']).toBe('true');
    expect(limpio['planes']).toHaveLength(1);
  });

  // La regla es por prefijo justamente para cubrir los canales que todavía no
  // existen. Si alguien agrega `_loQueSea` mañana, ya está contemplado.
  it.each([
    '_list', '_quickReplies', '_localUrl', '_mediaDelivered',
    '_suppressResponse', '_noOp', '_canalInventadoManana',
  ])('quita %s', (canal) => {
    const limpio = sinCanalesFueraDeBanda({ ok: true, [canal]: 'x' }) as Record<string, unknown>;
    expect(limpio[canal]).toBeUndefined();
    expect(limpio['ok']).toBe(true);
  });

  it('no toca los campos normales, ni los que llevan guion bajo en el medio', () => {
    const limpio = sinCanalesFueraDeBanda({
      client_id: 'abc', media_type: 'image', found: false, hora_agendada: '12:20',
    }) as Record<string, unknown>;

    expect(limpio).toEqual({
      client_id: 'abc', media_type: 'image', found: false, hora_agendada: '12:20',
    });
  });

  // No debe romperse con lo que devuelven las herramientas en los bordes.
  it.each([
    [null], [undefined], ['texto'], [42], [true],
  ])('deja pasar %p sin romperse', (valor) => {
    expect(sinCanalesFueraDeBanda(valor)).toBe(valor);
  });

  it('un arreglo se devuelve tal cual', () => {
    const arr = [{ _list: LISTA }];
    expect(sinCanalesFueraDeBanda(arr)).toBe(arr);
  });

  it('no muta el resultado original — el orquestador todavía lo necesita', () => {
    const original = { covered: 'true', _list: LISTA };
    sinCanalesFueraDeBanda(original);
    expect(original._list).toBe(LISTA);
  });
});
