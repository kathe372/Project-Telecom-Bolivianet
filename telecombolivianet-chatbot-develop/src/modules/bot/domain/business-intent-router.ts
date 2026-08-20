/**
 * Rutea texto libre a una intención de negocio ANTES de que el modelo elija.
 *
 * Por qué (2026-08-07): el modelo entiende bien el mensaje, pero después tiene
 * que elegir entre 25 herramientas y ahí se equivoca. Medido en producción: el
 * cliente escribió "Hola quiero realizar la instalación" y el bot ejecutó
 * `send_payment_qr` — le mandó el código de pago. Había pedido el QR minutos
 * antes en esa misma conversación, y el modelo arrastró ese contexto.
 *
 * No es un problema de comprensión: es de SELECCIÓN. Este router le saca la
 * decisión sólo cuando la intención es evidente, y le deja todo lo demás.
 *
 * REGLA CENTRAL: si coincide con más de una intención, o con ninguna, NO se
 * rutea — decide el modelo. Adivinar entre dos opciones plausibles es
 * exactamente el error que ya cometimos hoy con el mapeo de "sí"/"no", que
 * elegía el primer botón por descarte.
 */

export type IntencionNegocio = 'instalacion' | 'deuda' | 'pagar' | 'planes';

interface Regla {
  intencion: IntencionNegocio;
  patron: RegExp;
}

/**
 * Cada patrón exige un verbo o sustantivo propio de esa intención. No alcanza
 * con mencionar la palabra: "¿el router viene con la instalación?" es una
 * pregunta informativa, no un pedido de alta, y debe ir al RAG.
 */
const REGLAS: Regla[] = [
  {
    intencion: 'instalacion',
    patron: /\b(quiero|necesito|deseo|me gustaria|puedo)\b.{0,25}\b(instalaci[oó]n|instalar|contratar)\b|\bagendar (una |la |mi )?instalaci[oó]n\b/i,
  },
  {
    intencion: 'deuda',
    patron: /\b(cu[aá]nto|cuanto)\b.{0,15}\b(debo|adeudo|deuda)\b|\bmi deuda\b|\bestado de (mi )?cuenta\b|\bfacturas? pendientes?\b/i,
  },
  {
    intencion: 'pagar',
    patron: /\b(quiero|necesito|puedo|deseo)\b.{0,15}\bpagar\b|\b(pasame|env[ií]ame|mandame|dame)\b.{0,15}\b(el )?qr\b|\bc[oó]digo qr\b/i,
  },
  {
    intencion: 'planes',
    patron: /\bqu[eé] planes\b|\bplanes (tienen|hay|disponibles|ofrecen)\b|\blista de planes\b/i,
  },
];

/** Mensajes largos suelen traer matices que conviene que lea el modelo. */
const MAX_PALABRAS = 12;

/**
 * @returns la intención SOLO si es inequívoca; null si hay duda.
 */
export function detectarIntencionNegocio(texto: string): IntencionNegocio | null {
  const limpio = (texto ?? '').trim();
  if (!limpio) return null;
  if (limpio.split(/\s+/).length > MAX_PALABRAS) return null;

  const coincidencias = REGLAS.filter((r) => r.patron.test(limpio));

  // Dos intenciones a la vez ("quiero pagar mi deuda") no se resuelven acá:
  // el modelo tiene el contexto para desempatar y nosotros no.
  if (coincidencias.length !== 1) return null;

  return coincidencias[0].intencion;
}
