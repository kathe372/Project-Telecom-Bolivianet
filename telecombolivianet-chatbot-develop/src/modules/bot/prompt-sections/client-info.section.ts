import { Injectable } from '@nestjs/common';
import { SessionData } from '../../session/session.service';
import { IPromptSection } from './prompt-section.interface';
import { isLocationFresh } from '../../coverage/location-parser.util';

@Injectable()
export class ClientInfoSection implements IPromptSection {
  applies(_session: SessionData): boolean { return true; }

  render(session: SessionData): string {
    const isProspect     = !session.clientId;
    const locationHint   = this.buildLocationHint(session);
    const prospectHint   = isProspect ? this.buildProspectDataHint(session) : '';
    const plansHint      = isProspect ? this.buildPlansShownHint(session) : '';
    const selectedPlanHint = this.buildSelectedPlanHint(session);
    const clientInfo   = isProspect
      ? `El cliente NO está registrado en el sistema (prospecto).
NO puede consultar deuda ni recibir QR de pago.
Solo puede solicitar información sobre planes, precios e instalación.${locationHint}${prospectHint}${plansHint}${selectedPlanHint}`
      : `Cliente identificado:
  Nombre: ${session.clientName}
  Código TBN: ${session.tbnCode ?? 'N/D'}
  Estado de cuenta: ${session.clientStatus}
  Deuda actual: Bs. ${session.totalDebt?.toFixed(2) ?? '0.00'}
  Plan contratado: ${session.planName ?? 'N/D'}
  ${session.activeTicketId       ? `Ticket activo: ${session.activeTicketId}` : ''}
  ${session.activeInstallationId ? `Instalación activa: ${session.activeInstallationId}` : ''}${locationHint}${selectedPlanHint}`;

    return `ESTADO DEL CLIENTE:\n${clientInfo}`;
  }

  private buildLocationHint(session: SessionData): string {
    if (!session.lastLocation) return '';
    // BUG-04: una sola fuente de verdad con CoverageService. Si la ubicación
    // está caducada, NO la afirmamos como "ya la tengo" (evita que el bot se
    // contradiga: "ya tengo tu ubicación" ↔ "no pude determinarla").
    if (!isLocationFresh(session.locationCapturedAt)) {
      return `\n  (El cliente compartió una ubicación antes, pero puede estar desactualizada. ` +
        `Si vas a verificar cobertura, pídele que la comparta de nuevo.)`;
    }
    const { lat, lng, address, name } = session.lastLocation;
    return `\n  Ubicación GPS compartida: lat=${lat}, lng=${lng}` +
      (address ? `, dirección: ${address}` : '') +
      (name    ? `, zona: ${name}` : '');
  }

  /** Datos ya guardados con save_prospect_data — se muestran frescos en cada
   *  turno para que el agente NO tenga que re-derivarlos leyendo el
   *  historial de mensajes (que solo guarda los últimos N y puede haber
   *  descartado ya el turno donde se dieron). */
  private buildProspectDataHint(session: SessionData): string {
    if (!session.prospectName && !session.prospectIdentityCard && !session.prospectAddress
        && !session.prospectBackupPhone) return '';
    const parts: string[] = [];
    if (session.prospectName)         parts.push(`nombre: ${session.prospectName}`);
    if (session.prospectIdentityCard) parts.push(`CI: ${session.prospectIdentityCard}`);
    if (session.prospectAddress)      parts.push(`dirección: ${session.prospectAddress}`);
    if (session.prospectBackupPhone)  parts.push(`teléfono de respaldo: ${session.prospectBackupPhone}`);
    return `\n  Datos YA guardados para la instalación (${parts.join(', ')}) — ` +
      'NO los vuelvas a pedir, usalos directo al llamar create_installation.';
  }

  /** 2026-08-05: session.selectedPlanId (el UUID real, decodificado server-side
   *  al tocar el botón — ver bot-orchestrator.service.ts) ya era la fuente de
   *  verdad que usan get_installation_slots y create_installation si el
   *  modelo no manda plan_id, PERO nunca se mostraba en el prompt. Después de
   *   2-3 turnos pidiendo nombre/CI/teléfono de respaldo, el turno donde el
   *  cliente tocó el botón del plan sale de la ventana de historial (se
   *  recorta) y el modelo "olvida" que ya hay un plan elegido — volvía a
   *  preguntarlo aunque el dato seguía intacto en la sesión. Mismo
   *  tratamiento que ya tienen nombre/CI/dirección/teléfono. */
  private buildSelectedPlanHint(session: SessionData): string {
    if (!session.selectedPlanId) return '';
    return '\n  Plan YA elegido por el cliente en esta conversación (tocó el botón) — ' +
      'NO le vuelvas a preguntar qué plan quiere ni le muestres la lista de nuevo. ' +
      'Usalo directo (no hace falta que lo menciones por su id) al llamar get_installation_slots ' +
      'o create_installation.';
  }

  /** Si el cliente ya pidió/vio los planes en esta conversación (antes o
   *  después de compartir ubicación), no hace falta volver a preguntarle
   *  "¿te gustaría ver los planes?" al confirmar cobertura. */
  private buildPlansShownHint(session: SessionData): string {
    if (!session.plansShown) return '';
    return '\n  Los planes YA se le mostraron a este cliente en esta conversación — si ahora se ' +
      'confirma cobertura, NO le preguntes si quiere verlos de nuevo, llamá get_installation_plans ' +
      'directo en este mismo turno.';
  }
}
