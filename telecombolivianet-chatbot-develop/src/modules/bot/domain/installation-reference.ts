/**
 * Auditoría 2026-08: a diferencia de SupportTicket, la entidad Installation
 * del backend no tiene un número legible (no hay "TicketNumber" equivalente,
 * ver Installation.cs) — create/cancel/reschedule_installation devolvían el
 * GUID interno completo (result.InstalacionId) directo en el resultado de la
 * tool, y el modelo lo mostraba tal cual al cliente. Mismo problema que ya se
 * había resuelto para tickets con customerFacingTicketRef (ver
 * ticket-reference.ts) — se replica acá el mismo criterio: nunca el GUID
 * completo, siempre una referencia corta.
 */
export function customerFacingInstallationRef(installationId: string): string {
  return `INST-${installationId.substring(0, 8).toUpperCase()}`;
}
