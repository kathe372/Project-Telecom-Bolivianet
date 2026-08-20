import { Injectable } from '@nestjs/common';
import { SessionData } from '../../session/session.service';
import { IPromptSection } from './prompt-section.interface';
import { CSAT_VENTANA_MS, pendingCsatVigente } from '../domain/csat-window';

// La ventana vive en domain/csat-window.ts: la comparten esta sección y
// UpdateTicketTool. Se reexporta para no romper importaciones existentes.
export { CSAT_VENTANA_MS };

@Injectable()
export class CsatFlowSection implements IPromptSection {
  /**
   * FASE G4: además de existir, el CSAT tiene que estar VIGENTE.
   *
   * Antes bastaba con que `pendingCsatTicketId` estuviera seteado, y ese campo
   * no caducaba nunca: si el cliente no calificaba, el bloque se inyectaba en
   * TODOS los prompts siguientes, con el UUID del ticket cerrado a la vista.
   *
   * Consecuencia medida en producción: dos días después, al reportar un
   * problema NUEVO, el modelo tomó ese UUID viejo del prompt y llamó
   * `update_ticket` con él → HTTP 400 "Un ticket cerrado no puede modificarse".
   */
  applies(session: SessionData): boolean {
    return pendingCsatVigente(session) !== null;
  }

  render(session: SessionData): string {
    return `PENDIENTE: El cliente debe calificar el servicio del ticket ${session.pendingCsatTicketId}.

La calificación se pide con los BOTONES que devolvió close_support_ticket. Un
número suelto escrito por el cliente NO es una calificación: puede estar
contestando otra cosa ("5" megas, "3" dispositivos, "el 5 de agosto"). Si querés
la nota y no hay botones a la vista, volvé a ofrecer la lista — no interpretes.

Cuando el sistema te indique que el cliente calificó (llega el número ya
resuelto desde el botón) o cuando use palabras inequívocas de valoración
referidas a la atención ("me atendieron excelente", "pésima atención"):
1. Usa esa calificación en escala del 1 al 5
2. OBLIGATORIO: llama update_ticket ANTES de agradecer. PROHIBIDO agradecer o decir
   "hemos registrado tu calificación" sin haber llamado update_ticket primero. Usa:
   ticket_id = "${session.pendingCsatTicketId}"
   root_cause = "CSAT: N/5 — [comentario textual si el cliente lo dio]"
   (usa root_cause, NO description — la descripción original del problema no debe modificarse)
3. Solo DESPUÉS de que update_ticket retorne éxito, agradece al cliente con 1-2 líneas

Si el cliente escribe otra cosa sin calificar:
- NO llames update_ticket
- Atiende la nueva consulta normalmente
- El sistema limpiará el CSAT pendiente cuando el cliente responda en otro momento`;
  }
}
