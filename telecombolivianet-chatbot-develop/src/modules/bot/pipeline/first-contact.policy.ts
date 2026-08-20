import { Injectable } from '@nestjs/common';
import { MessageContext } from './message-context';

const GREETING_RE = /^(hola+|buenas+( (tardes|noches|d[ií]as))?|hey|hi|hello|saludos|buen d[ií]a)[\s!.,;:🙂😀👋]*$/i;

/**
 * BUG-4: decide si el primer mensaje de un usuario trae contenido accionable
 * (ubicación GPS, imagen, audio o una consulta real) además del saludo.
 * Si lo trae, el orquestrador envía la bienvenida Y ADEMÁS procesa el
 * contenido en el mismo turno, en vez de descartarlo.
 */
@Injectable()
export class FirstContactPolicy {

  hasActionableContent(ctx: MessageContext): boolean {
    if (ctx.type === 'location' || ctx.type === 'image' || ctx.type === 'audio') return true;

    const text = ctx.text?.trim() ?? '';
    if (!text) return false;
    return !GREETING_RE.test(text);
  }

  /**
   * PASO 6B: detecta un saludo suelto en CUALQUIER punto de la conversación,
   * no solo el primer contacto — usado para volver a mostrar el menú con
   * botones en vez de que el LLM narre las opciones en texto plano.
   */
  isBareGreeting(ctx: MessageContext): boolean {
    if (ctx.type !== 'text') return false;
    const text = ctx.text?.trim() ?? '';
    return !!text && GREETING_RE.test(text);
  }
}
