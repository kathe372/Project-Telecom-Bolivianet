import { Injectable } from '@nestjs/common';

/**
 * PASO 8 (2026-08): DEFAULT_INTENT_MAP es un diccionario estático — correcto
 * para el puñado de ids fijos de siempre (menu, solicitar_qr, etc.), pero no
 * puede conocer de antemano un UUID de plan o una fecha+hora de instalación.
 * En vez de un almacén nuevo, el propio id del botón lleva el dato adentro
 * (mismo patrón que `callback_data` de Telegram) — sin estado de servidor,
 * decodificable de forma síncrona.
 */
export type DecodedInteractiveId =
  | { kind: 'plan'; planId: string }
  | { kind: 'slot'; date: string; time: string }
  | { kind: 'account'; clientId: string }
  | { kind: 'csat'; score: number }
  | { kind: 'proc'; clave: string }
  | { kind: 'static'; id: string };

@Injectable()
export class InteractiveIdCodec {
  encodePlan(planId: string): string {
    return `plan:${planId}`;
  }

  encodeSlot(date: string, time: string): string {
    return `slot:${date}:${time}`;
  }

  /** 2026-08-05: fila del menú de "¿con cuál de tus servicios continuamos?"
   *  cuando un teléfono tiene más de un cliente asociado (ver
   *  ClientIdentificationHandler / AccountChoiceService). */
  encodeAccount(clientId: string): string {
    return `account:${clientId}`;
  }

  /**
   * 2026-08-07: la calificación llegaba como texto libre y el modelo
   * interpretaba cualquier número del 1 al 5 durante las 2 horas siguientes al
   * cierre del ticket. "5" contestando "¿cuántos dispositivos tenés?" quedaba
   * registrado como 5/5, y el CSAT se marcaba pendiente al cerrar el ticket
   * aunque el mensaje pidiendo la nota nunca hubiera llegado.
   *
   * Un `csat:4` no se puede confundir con nada, y sólo puede existir si el bot
   * mandó los botones: la evidencia de que preguntó viene en la respuesta.
   */
  encodeCsat(score: number): string {
    return `csat:${score}`;
  }

  decode(rawId: string): DecodedInteractiveId {
    const id = rawId ?? '';
    const [kind, ...rest] = id.split(':');

    if (kind === 'plan' && rest.length > 0 && rest.join(':').trim()) {
      return { kind: 'plan', planId: rest.join(':') };
    }
    // La hora ("09:00") ya trae un ':' — no se puede exigir rest.length === 2,
    // hay que tomar la fecha como el primer segmento y unir el resto.
    if (kind === 'slot' && rest.length >= 2 && rest[0].trim() && rest.slice(1).join(':').trim()) {
      return { kind: 'slot', date: rest[0], time: rest.slice(1).join(':') };
    }
    if (kind === 'account' && rest.length > 0 && rest.join(':').trim()) {
      return { kind: 'account', clientId: rest.join(':') };
    }
    // Bloque de un procedimiento definido en un documento. El destino viaja en
    // el id, asi que navegar no necesita estado de servidor.
    if (kind === 'proc' && rest.join(':').trim()) {
      return { kind: 'proc', clave: rest.join(':').trim() };
    }
    if (kind === 'csat' && rest.length === 1) {
      const score = Number(rest[0]);
      // Fuera de 1-5 no es una calificación: se deja caer a 'static' en vez de
      // inventar una nota, que es lo que hacía la interpretación por texto.
      if (Number.isInteger(score) && score >= 1 && score <= 5) {
        return { kind: 'csat', score };
      }
    }
    return { kind: 'static', id };
  }
}
