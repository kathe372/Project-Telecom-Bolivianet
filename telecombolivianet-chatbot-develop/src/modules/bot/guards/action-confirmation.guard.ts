import { Injectable } from '@nestjs/common';

/**
 * BUG-1: impide que el agente afirme acciones de escritura (agendar, registrar,
 * cerrar, cancelar...) que ninguna herramienta mutante ejecutó con éxito.
 * Detección conservadora: solo formas que AFIRMAN ejecución (participios,
 * perfecto compuesto, 1ª persona plural), nunca ofertas o preguntas.
 */
@Injectable()
export class ActionConfirmationGuard {

  /**
   * AFIRMAN que la acción se ejecutó. Se comprueban SIEMPRE: nada legitima
   * decir "ya agendé tu instalación" si ninguna herramienta la agendó.
   */
  private static readonly ASSERTION_PATTERNS: RegExp[] = [
    /\b(he|hemos|fue|ha sido|qued[oó]|ya est[aá])\s+(agendad|registrad|cancelad|reprogramad|cerrad|actualizad|reabiert|escalad|transferid)\w*/i,
    /\b(agendamos|registramos|cancelamos|reprogramamos|cerramos|actualizamos|escalamos|agendaremos|registraremos)\b/i,
    // 2026-08-07: la 1ª persona SINGULAR no estaba cubierta — justo la forma
    // más natural de la alucinación ("ya agendé tu instalación"). El guard la
    // dejaba pasar mientras castigaba frases informativas correctas.
    // Sólo las formas ACENTUADAS: el pretérito de 1ª persona siempre lleva
    // tilde, y exigirla evita chocar con el subjuntivo ("para que agende...").
    // El cierre es un lookahead, no `\b`: en JS `\b` es ASCII, así que entre
    // "agendé" y el espacio siguiente NO hay frontera de palabra y el patrón
    // no llegaba a disparar nunca.
    /\b(ya\s+)?(agendé|registré|cancelé|reprogramé|cerré|actualicé|reabrí|escalé|transferí|cambié)(?![\wáéíóúñ])/i,
    /\bsolicitud\s+.{0,40}\bregistrad[ao]\b/i,
  ];

  /**
   * DESCRIBEN un estado (sustantivo + participio) sin decir quién lo hizo ni
   * cuándo: "tu instalación agendada es el 12 de agosto". Si una herramienta de
   * consulta acaba de devolver ese estado, la frase es un reporte legítimo.
   *
   * Medido en producción (2026-08-07): el bot respondió correctamente la fecha
   * de una instalación leída con `get_active_installation`, y este patrón la
   * marcó como mentira sólo porque "instalación agendada" aparecía en el texto.
   * Forzó una corrección innecesaria sobre una respuesta que era correcta.
   */
  private static readonly DESCRIPTIVE_PATTERNS: RegExp[] = [
    /\b(instalaci[oó]n|ticket|solicitud|cambio|calificaci[oó]n)\s+(agendad|registrad|cread|cerrad|cancelad|reprogramad|actualizad)\w*/i,
  ];

  /**
   * Banderas con las que una herramienta mutante declara ÉXITO.
   *
   * FASE G1 (2026-08-07): faltaba `scheduled`, la que devuelve
   * schedule_ticket_visit. Consecuencia medida en producción, en cadena:
   *
   *   1. La visita se agendaba bien (`scheduled: true`)
   *   2. Esta lista no la reconocía → "no hubo mutación"
   *   3. El texto "su visita ha sido agendada" quedaba marcado como mentira
   *   4. La corrección le ordenaba al modelo "llamá AHORA a la herramienta"
   *      → **se creaba una SEGUNDA visita idéntica**
   *   5. Y al cliente se le respondía "⚠️ Aún no pude completar esa acción"
   *      por una acción que sí se había completado. Dos veces.
   *
   * Una palabra faltante en una lista. Por eso el spec de este guard ahora
   * ESCANEA el código de todas las tools mutantes y falla si alguna devuelve
   * una bandera de éxito que no esté acá — para que la próxima herramienta que
   * se agregue no repita el mismo silencio.
   */
  static readonly OUTCOME_FLAGS = [
    'created', 'closed', 'updated', 'reopened', 'cancelled',
    'rescheduled', 'sent', 'queued', 'changed', 'scheduled',
  ] as const;

  /**
   * ¿El resultado de una herramienta mutante representa una ejecución exitosa?
   *
   * FAIL-CLOSED: exige una señal POSITIVA explícita (alguna flag de resultado en
   * `true`). Antes bastaba con que ninguna flag conocida estuviera en `false`,
   * así que cualquier tool nueva que devolviera una forma inesperada ({ ok: true },
   * {}) contaba como mutación exitosa y DESACTIVABA la corrección de
   * confirmaciones sin respaldo durante todo el turno. Un mecanismo de seguridad
   * no puede fallar en abierto.
   */
  isSuccessfulMutation(result: unknown): boolean {
    if (result === null || typeof result !== 'object') return false;
    const r = result as Record<string, unknown>;
    if (r.error) return false;
    if (ActionConfirmationGuard.OUTCOME_FLAGS.some((flag) => r[flag] === false)) return false;
    return ActionConfirmationGuard.OUTCOME_FLAGS.some((flag) => r[flag] === true);
  }

  /**
   * ¿La respuesta afirma una acción de escritura sin respaldo real de herramienta?
   *
   * @param stateReadBacked true si en este turno una herramienta de CONSULTA
   *   devolvió el estado del que habla la respuesta. En ese caso las formas
   *   meramente descriptivas están respaldadas por un dato real y no se
   *   penalizan; las que afirman haber ejecutado la acción se siguen midiendo.
   */
  isUnbackedConfirmation(
    finalText: string,
    mutationSucceeded: boolean,
    stateReadBacked = false,
  ): boolean {
    if (mutationSucceeded || !finalText) return false;
    const assertive = this.stripQuestions(finalText);

    if (ActionConfirmationGuard.ASSERTION_PATTERNS.some((p) => p.test(assertive))) return true;
    if (stateReadBacked) return false;
    return ActionConfirmationGuard.DESCRIPTIVE_PATTERNS.some((p) => p.test(assertive));
  }

  /** Elimina segmentos interrogativos: una oferta ("¿Desea que agende...?") no es confirmación. */
  private stripQuestions(text: string): string {
    return text
      .replace(/¿[^?]*\?/g, ' ')
      .split('\n')
      .filter((line) => !line.trim().endsWith('?'))
      .join('\n');
  }
}
