import { ActionConfirmationGuard } from './action-confirmation.guard';

describe('ActionConfirmationGuard', () => {
  let guard: ActionConfirmationGuard;

  beforeEach(() => {
    guard = new ActionConfirmationGuard();
  });

  describe('isSuccessfulMutation', () => {
    it('acepta resultado exitoso de creación', () => {
      expect(guard.isSuccessfulMutation({ created: true, instalacionId: 'abc' })).toBe(true);
    });

    it('rechaza resultado con error', () => {
      expect(guard.isSuccessfulMutation({ error: 'backend caído' })).toBe(false);
    });

    it('rechaza created:false (ticket existente)', () => {
      expect(guard.isSuccessfulMutation({ created: false, existingTicketId: 'x' })).toBe(false);
    });

    it('rechaza null y primitivos', () => {
      expect(guard.isSuccessfulMutation(null)).toBe(false);
      expect(guard.isSuccessfulMutation('ok')).toBe(false);
    });

    // CAMBIO DELIBERADO (auditoría 2026-08-01): el guard ahora es fail-closed.
    // Antes un resultado de forma inesperada ({ changeId }, { ok: true }, {})
    // contaba como mutación exitosa y desactivaba la corrección de confirmaciones
    // sin respaldo para todo el turno. Un mecanismo de seguridad no puede
    // considerarse satisfecho por defecto: exige una flag de resultado en true.
    it('rechaza resultado sin flags de resultado conocidas (fail-closed)', () => {
      expect(guard.isSuccessfulMutation({ changeId: '123' })).toBe(false);
      expect(guard.isSuccessfulMutation({ ok: true })).toBe(false);
      expect(guard.isSuccessfulMutation({})).toBe(false);
    });

    it('acepta cada flag de resultado del contrato de las tools mutantes', () => {
      // Estas son las flags que emiten las 11 tools mutantes reales.
      for (const flag of ['created', 'closed', 'updated', 'reopened',
                          'cancelled', 'rescheduled', 'sent', 'queued']) {
        expect(guard.isSuccessfulMutation({ [flag]: true })).toBe(true);
      }
    });

    it('rechaza si conviven una flag en true y otra en false', () => {
      expect(guard.isSuccessfulMutation({ sent: true, created: false })).toBe(false);
    });
  });

  describe('isUnbackedConfirmation', () => {
    const CASO_C13 = 'Agendaremos su instalación del Plan Plata para el lunes 14 de julio a las 10:00.';
    const CASO_E2  = 'Muchas gracias por tu calificación. Hemos registrado tu comentario.';

    it('detecta la confirmación falsa del caso C13 (instalación)', () => {
      expect(guard.isUnbackedConfirmation(CASO_C13, false)).toBe(true);
    });

    it('detecta la confirmación falsa del caso E2 (CSAT)', () => {
      expect(guard.isUnbackedConfirmation(CASO_E2, false)).toBe(true);
    });

    it('detecta "instalación agendada" en participio', () => {
      expect(guard.isUnbackedConfirmation('✅ Tu instalación quedó agendada para mañana.', false)).toBe(true);
    });

    it('NO marca cuando una mutación real tuvo éxito', () => {
      expect(guard.isUnbackedConfirmation(CASO_C13, true)).toBe(false);
    });

    it('NO marca ofertas en pregunta ("¿Desea que agendemos...?")', () => {
      expect(guard.isUnbackedConfirmation('¿Desea que agendemos su instalación para el lunes?', false)).toBe(false);
    });

    it('NO marca peticiones de datos', () => {
      expect(guard.isUnbackedConfirmation('Para agendar tu instalación necesito tu dirección exacta.', false)).toBe(false);
    });

    it('NO marca respuestas informativas (deuda, planes)', () => {
      expect(guard.isUnbackedConfirmation('Tu deuda es de Bs 149.00 correspondiente a junio.', false)).toBe(false);
      expect(guard.isUnbackedConfirmation('Tenemos Plan Cobre, Plata y Oro disponibles.', false)).toBe(false);
    });

    it('NO marca texto vacío', () => {
      expect(guard.isUnbackedConfirmation('', false)).toBe(false);
    });
  });
});

// ── FASE G1 (2026-08-07) ─────────────────────────────────────────────────────
// Regresion del incidente de produccion mas caro de la sesion de pruebas:
// schedule_ticket_visit devolvia `scheduled: true`, una bandera que OUTCOME_FLAGS
// no conocia. El guard concluyo "no hubo mutacion", marco como mentira el texto
// "su visita ha sido agendada", forzo la correccion "llama AHORA a la
// herramienta" — y el modelo la llamo otra vez, creando una SEGUNDA visita. Al
// cliente se le respondio dos veces "Aun no pude completar esa accion" por una
// accion que si se completo. Todo por una palabra faltante en una lista.
describe('G1 — la lista de banderas debe cubrir TODAS las tools mutantes', () => {
  const fs   = require('fs');
  const path = require('path');
  const dirTools = path.resolve(__dirname, '..', 'tools');

  /** Lee el fuente de cada tool mutante y extrae las banderas `<x>: true` que devuelve. */
  const banderasPorTool = (): Record<string, string[]> => {
    const salida: Record<string, string[]> = {};
    for (const archivo of fs.readdirSync(dirTools).filter((f: string) => f.endsWith('.tool.ts'))) {
      const src = fs.readFileSync(path.join(dirTools, archivo), 'utf-8');
      if (!/isMutating\(\)\s*:\s*boolean\s*\{\s*return true;/.test(src)) continue;
      const encontradas = new Set<string>();
      for (const m of src.matchAll(/\b([a-zA-Z][a-zA-Z0-9_]*)\s*:\s*true\b/g)) {
        const nombre = m[1];
        // No son banderas de resultado y por eso no deben estar en OUTCOME_FLAGS:
        //   pending      → resumen del paso 1 (lo maneja hasPendingConfirmation)
        //   deduped      → la acción se omitió por deduplicación, no mutó nada
        //   noDebt       → el cliente no tenía deuda; no es un éxito de escritura
        //   csatPending  → marca que queda pendiente pedir la calificación
        //   AutoAssign   → campo del DTO que se ENVÍA al backend, no una respuesta
        //   deferred     → describe el modo de la escalación (fuera de horario)
        // Los canales fuera de banda (_localUrl, _mediaDelivered, _noOp, _list…)
        // quedan excluidos solos: el \b de la regex no cruza el guion bajo inicial.
        const noSonResultado = [
          'pending', 'deduped', 'noDebt', 'csatPending', 'AutoAssign', 'deferred',
          // 17 (2026-08-07): clasifica el error, no declara un resultado.
          'errorInterno',
        ];
        if (nombre.startsWith('_') || noSonResultado.includes(nombre)) continue;
        encontradas.add(nombre);
      }
      if (encontradas.size) salida[archivo] = [...encontradas];
    }
    return salida;
  };

  it('ninguna tool mutante devuelve una bandera de exito que el guard ignore', () => {
    const conocidas = new Set<string>(ActionConfirmationGuard.OUTCOME_FLAGS as readonly string[]);
    const desconocidas: string[] = [];
    const escaneadas = banderasPorTool();

    // Auto-chequeo: un escaner que no escanea nada pasaria siempre en verde.
    // Es exactamente el fallo silencioso que este bloque existe para evitar.
    expect(Object.keys(escaneadas).length).toBeGreaterThanOrEqual(8);

    for (const [archivo, banderas] of Object.entries(escaneadas)) {
      for (const b of banderas) {
        if (!conocidas.has(b)) desconocidas.push(`${archivo} → \`${b}: true\``);
      }
    }

    expect(desconocidas).toEqual([]);
  });

  it('detecta el caso concreto que rompio en produccion', () => {
    const guard = new ActionConfirmationGuard();
    // Exactamente lo que devuelve schedule_ticket_visit al agendar bien.
    expect(guard.isSuccessfulMutation({ scheduled: true, visitId: 'v-1' })).toBe(true);
    // Y el fallo sigue siendo fallo.
    expect(guard.isSuccessfulMutation({ scheduled: false, error: 'x' })).toBe(false);
  });

  it('el resumen del paso 1 (pending) NO cuenta como mutacion exitosa', () => {
    const guard = new ActionConfirmationGuard();
    // Es correcto que devuelva false: no mutó nada. Lo que NO debe pasar es que
    // el orquestador aplique el guard sobre ese turno — de eso se encarga
    // hasPendingConfirmation() en el registry.
    expect(guard.isSuccessfulMutation({ cancelled: false, pending: true })).toBe(false);
  });
});

// ── 2026-08-07: falso positivo medido en producción ──────────────────────────
// El bot respondió correctamente la fecha de una instalación leída con
// `get_active_installation` y el guard la marcó como inventada, sólo porque el
// texto contenía la adyacencia "instalación agendada". Forzó una corrección
// innecesaria sobre una respuesta que era correcta.
//
// Al investigarlo apareció algo peor: el guard NO detectaba la 1ª persona
// singular — "ya agendé tu instalación" — que es la forma más natural de la
// alucinación que existe para atrapar. Castigaba lo correcto y dejaba pasar lo
// falso.
describe('ActionConfirmationGuard — describir un estado no es afirmar una acción', () => {
  const guard = new ActionConfirmationGuard();

  const REPORTES = [
    'Su instalación está agendada para el 12 de agosto de 2026 a las 10:00.',
    'Tu instalación agendada es el 12 de agosto a las 10:00.',
    'Tenés un ticket registrado del 5 de agosto, sigue en proceso.',
    'La instalación cancelada del 11 de agosto ya no está vigente.',
  ];

  it.each(REPORTES)('con respaldo de una consulta, no se penaliza: %s', (texto) => {
    expect(guard.isUnbackedConfirmation(texto, false, true)).toBe(false);
  });

  it.each(REPORTES.slice(1, 2))('sin ninguna consulta detrás, sí se sospecha: %s', (texto) => {
    // Si el agente describe un estado que ninguna herramienta le dio, se lo
    // está inventando. El guard sigue actuando.
    expect(guard.isUnbackedConfirmation(texto, false, false)).toBe(true);
  });

  // Esto es lo que el guard debía atrapar desde el principio.
  const ALUCINACIONES = [
    'Ya agendé tu instalación para el 12 de agosto.',
    'Listo, registré tu solicitud de cambio de plan.',
    'Cancelé tu instalación como pediste.',
    'Reprogramé la visita para el jueves.',
    'Cerré tu ticket, gracias por avisar.',
    'Actualicé tus datos en el sistema.',
  ];

  it.each(ALUCINACIONES)('afirmar la acción en 1ª persona siempre se detecta: %s', (texto) => {
    // Ni siquiera una consulta previa legitima decir que YO ejecuté la escritura.
    expect(guard.isUnbackedConfirmation(texto, false, true)).toBe(true);
  });

  it('si una herramienta mutante tuvo éxito, nada se penaliza', () => {
    expect(guard.isUnbackedConfirmation(ALUCINACIONES[0], true, false)).toBe(false);
  });

  it('una oferta en pregunta nunca es una confirmación', () => {
    expect(guard.isUnbackedConfirmation('¿Querés que agende tu instalación?', false, false)).toBe(false);
    expect(guard.isUnbackedConfirmation('¿Cancelo tu instalación?', false, false)).toBe(false);
  });
});
