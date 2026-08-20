/**
 * PASO 2B (2026-08): varias tools mostraban el GUID interno del ticket
 * (session.activeTicketId / ticketId crudo) directo en el texto al cliente,
 * en vez del número legible (TK-2026-0001) que el backend ya genera. Esta
 * función centraliza la regla — ya existía correctamente una sola vez en
 * get-active-ticket.tool.ts y nunca se reutilizó en el resto de tools.
 */
export interface TicketLike {
  Id:           string;
  TicketNumber?: string | null;
}

/** Referencia de ticket segura para el cliente — NUNCA el GUID interno completo. */
export function customerFacingTicketRef(ticket: TicketLike): string {
  return ticket.TicketNumber?.trim() || `TK-${ticket.Id.substring(0, 8).toUpperCase()}`;
}
