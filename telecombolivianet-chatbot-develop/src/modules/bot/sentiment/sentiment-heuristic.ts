import { Injectable } from '@nestjs/common';

/** null = ambiguo → decide el LLM. Solo resuelve los casos evidentes. */
export type HeuristicResult = 'neutral' | 'angry' | null;

/**
 * Opt-A: clasifica el sentimiento con reglas locales ANTES de gastar una llamada
 * a Gemini. La mayoría de mensajes de atención son obviamente neutrales ("sí",
 * "gracias") o obviamente molestos (groserías, GRITOS); solo los ambiguos van al
 * LLM. Reduce ~1 llamada a Gemini por mensaje en el caso común.
 * Algoritmo PURO (sin dependencias), testeable en aislamiento.
 */
@Injectable()
export class SentimentHeuristic {
  private static readonly ANGER = /\b(p[eé]simo|horrible|basura|estafa|ladron(es)?|in[uú]til|verg[üu]enza|indignad|denunci|nunca funciona|no sirve|un asco|fraude|robo)/i;
  private static readonly PROFANITY = /\b(mierda|carajo|puta|jodid|maldit|conchud)/i;
  private static readonly NEUTRAL_SHORT = /^(s[ií]|no|ok(ay)?|dale|gracias|listo|hola|buenas|perfecto|entiendo|ya|👍|✅|🙏)[\s!.,]*$/i;

  classify(text: string): HeuristicResult {
    const t = (text ?? '').trim();
    if (!t) return 'neutral';
    if (SentimentHeuristic.ANGER.test(t) || SentimentHeuristic.PROFANITY.test(t)) return 'angry';
    if (this.isShouting(t)) return 'angry';
    if (t.length <= 12 && SentimentHeuristic.NEUTRAL_SHORT.test(t)) return 'neutral';
    if (t.length <= 25 && !/[!?¡¿]/.test(t)) return 'neutral';
    return null;
  }

  /** Mayúsculas sostenidas + signos de exclamación repetidos = enojo ("NO SIRVE NADA!!!"). */
  private isShouting(t: string): boolean {
    const letters = t.replace(/[^a-záéíóúñ]/gi, '');
    if (letters.length < 8) return false;
    const upper = (t.match(/[A-ZÁÉÍÓÚÑ]/g) || []).length;
    return upper / letters.length > 0.7 && /!{2,}/.test(t);
  }
}
