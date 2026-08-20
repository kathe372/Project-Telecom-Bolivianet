import { SessionData } from '../../session/session.service';

/**
 * Ventana durante la cual tiene sentido pedir (y aceptar) la calificación.
 * Pasado ese tiempo el cliente ya no se acuerda del ticket, y seguir tratando
 * cualquier número suelto como una nota es ruido — o peor, un error.
 */
export const CSAT_VENTANA_MS = 2 * 60 * 60_000; // 2 horas

/**
 * El ticket pendiente de calificar, SOLO si sigue vigente.
 *
 * Existe como función compartida por un fallo real (2026-08-07): la caducidad
 * se implementó primero únicamente en la sección del prompt. El bloque CSAT
 * dejó de inyectarse, pero `UpdateTicketTool` seguía leyendo
 * `session.pendingCsatTicketId` en crudo, así que un "5" suelto tres horas
 * después igual escribía una calificación en el ticket viejo.
 *
 * Medido en producción con la marca envejecida a propósito: el modelo llamó
 * `update_ticket` SIN `ticket_id` — prueba de que el prompt ya estaba limpio —
 * y la herramienta lo rellenó sola desde la sesión.
 *
 * Gatear la superficie visible no sirve si el dato sigue accesible por detrás.
 * Por eso la regla vive acá y no duplicada en cada consumidor.
 */
export function pendingCsatVigente(session: SessionData): string | null {
  const id = session.pendingCsatTicketId;
  if (!id) return null;
  const desde = session.pendingCsatAt;
  // Sesiones anteriores al cambio no tienen la marca: se respeta el
  // comportamiento previo en vez de descartarles la calificación.
  if (!desde) return id;
  return (Date.now() - desde) <= CSAT_VENTANA_MS ? id : null;
}
