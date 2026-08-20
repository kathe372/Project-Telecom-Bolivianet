import { parseProcedure, normalizarPregunta, ACCIONES_CONOCIDAS } from './procedure-parser';

/**
 * El procedimiento vive en el documento que sube el usuario, no en el código.
 * Estos tests fijan el contrato de ese formato: si el documento está mal
 * escrito, tiene que fallar AL SUBIRLO y no cuando un cliente caiga en la rama
 * rota.
 */
const DOC = `
SOPORTE TECNICO - DIAGNOSTICO

¿No tengo internet?
Vamos a revisar tu equipo. Mirá el módem y fijate de qué color está la luz.
¿De qué color está la luz?
>> BOTON: 🔴 Roja -> ¿La luz del módem está roja?
>> BOTON: 🟢 Verde -> ¿La luz del módem está verde?

¿La luz del módem está roja?
La luz roja indica un problema en la señal de fibra que llega a tu casa.
Necesitamos enviarte un técnico.
>> ACCION: crear_ticket tipo=cable_cortado
>> ACCION: ofrecer_visita

¿La luz del módem está verde?
La señal llega bien. Desenchufá el módem 10 segundos y volvé a enchufarlo.
>> BOTON: ✅ Volvió -> ¿Reinicié el router y mejoró?
>> BOTON: ❌ Sigue igual -> ¿Reinicié el router y sigue igual?

¿Reinicié el router y mejoró?
Perfecto, era algo puntual del equipo.

¿Reinicié el router y sigue igual?
Necesitamos revisarlo nosotros.
>> ACCION: crear_ticket tipo=velocidad_lenta
`;

describe('parseProcedure', () => {
  it('arma un bloque por pregunta', () => {
    const { blocks, errors } = parseProcedure(DOC);

    expect(errors).toEqual([]);
    expect(blocks.size).toBe(5);
    expect([...blocks.keys()]).toContain(normalizarPregunta('¿No tengo internet?'));
  });

  it('una pregunta DENTRO del texto no parte el bloque', () => {
    const { blocks } = parseProcedure(DOC);
    const inicio = blocks.get(normalizarPregunta('¿No tengo internet?'))!;

    // "¿De qué color está la luz?" es parte del mensaje al cliente, no un bloque.
    expect(inicio.body).toContain('¿De qué color está la luz?');
    expect(blocks.has(normalizarPregunta('¿De qué color está la luz?'))).toBe(false);
  });

  it('lee los botones con su destino', () => {
    const { blocks } = parseProcedure(DOC);
    const inicio = blocks.get(normalizarPregunta('¿No tengo internet?'))!;

    expect(inicio.buttons).toEqual([
      { label: '🔴 Roja',  next: '¿La luz del módem está roja?' },
      { label: '🟢 Verde', next: '¿La luz del módem está verde?' },
    ]);
  });

  it('lee las acciones con sus parámetros', () => {
    const { blocks } = parseProcedure(DOC);
    const roja = blocks.get(normalizarPregunta('¿La luz del módem está roja?'))!;

    expect(roja.actions).toEqual([
      { name: 'crear_ticket',   params: { tipo: 'cable_cortado' } },
      { name: 'ofrecer_visita', params: {} },
    ]);
  });

  it('un bloque de cierre sin botones ni acciones es válido', () => {
    const { blocks, errors } = parseProcedure(DOC);
    const fin = blocks.get(normalizarPregunta('¿Reinicié el router y mejoró?'))!;

    expect(fin.buttons).toEqual([]);
    expect(fin.actions).toEqual([]);
    expect(errors).toEqual([]);
  });

  // ── Validación: los errores tienen que aparecer al SUBIR el documento ──────
  describe('errores del documento', () => {
    it('detecta un botón que lleva a una pregunta inexistente', () => {
      const { errors } = parseProcedure(`
¿Hola?
Texto.
>> BOTON: Seguir -> ¿Pregunta que no existe?
`);
      expect(errors.join(' ')).toMatch(/no existe en el documento/);
      expect(errors.join(' ')).toMatch(/Pregunta que no existe/);
    });

    it('detecta una acción que el ejecutor no sabe hacer', () => {
      const { errors } = parseProcedure(`
¿Hola?
Texto.
>> ACCION: mandar_tecnico_en_helicoptero
`);
      expect(errors.join(' ')).toMatch(/no existe/);
      expect(errors.join(' ')).toMatch(ACCIONES_CONOCIDAS[0]);
    });

    it('detecta un botón sin destino', () => {
      const { errors } = parseProcedure(`
¿Hola?
Texto.
>> BOTON: Seguir
`);
      expect(errors.join(' ')).toMatch(/no indica a dónde lleva/);
    });

    it('detecta preguntas repetidas', () => {
      const { errors } = parseProcedure(`
¿Hola?
Primer texto.

¿Hola?
Segundo texto.
`);
      expect(errors.join(' ')).toMatch(/repetida/);
    });

    it('rechaza un documento sin ninguna pregunta', () => {
      const { errors } = parseProcedure('Solo texto suelto, sin preguntas.');
      expect(errors.join(' ')).toMatch(/ningún bloque con pregunta/);
    });

    it('detecta una directiva suelta antes de cualquier bloque', () => {
      const { errors } = parseProcedure('>> ACCION: crear_ticket\n\n¿Hola?\nTexto.');
      expect(errors.join(' ')).toMatch(/antes de cualquier pregunta/);
    });
  });

  // Un tipeo en las tildes no debe romper el flujo en producción.
  describe('tolerancia a la escritura', () => {
    it('encuentra el destino aunque la rama esté sin tildes', () => {
      const { errors } = parseProcedure(`
¿No tengo internet?
Texto.
>> BOTON: Verde -> ¿La luz del modem esta verde?

¿La luz del módem está verde?
Texto.
`);
      expect(errors).toEqual([]);
    });

    it('normaliza tildes, mayúsculas y signos', () => {
      expect(normalizarPregunta('¿La LUZ del módem está VERDE?'))
        .toBe(normalizarPregunta('la luz del modem esta verde'));
    });
  });
});
