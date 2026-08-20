import { Inject, Injectable, Logger } from '@nestjs/common';
import { ITicketRepository, TICKET_REPOSITORY } from '../../client/sistema-api.interfaces';
import { SessionService, SessionData } from '../../session/session.service';
import { AgentTool } from './agent-tool.interface';
import { pendingCsatVigente } from '../domain/csat-window';
import { customerFacingTicketRef } from '../domain/ticket-reference';

const MAX_LEN = 990;

@Injectable()
export class UpdateTicketTool implements AgentTool {
  private readonly logger = new Logger(UpdateTicketTool.name);

  constructor(
    @Inject(TICKET_REPOSITORY) private readonly ticketRepo: ITicketRepository,
    private readonly sessionService: SessionService,
  ) {}

  getName(): string { return 'update_ticket'; }
  requiresIdentification(): boolean { return true; }
  isMutating(): boolean { return true; }

  getDeclaration(): object {
    return {
      name: this.getName(),
      description:
        'Actualiza información del ticket activo del cliente. ' +
        'Tiene dos usos: ' +
        '(1) CSAT: cuando el cliente califica el servicio (1 al 5 o palabras como "excelente/bien/malo"), ' +
        'usa root_cause="CSAT: N/5 — [comentario]" — NO uses description para CSAT; ' +
        '(2) INFO ADICIONAL: cuando el cliente da más detalles del problema después de crear el ticket, ' +
        'usa description con la información nueva.',
      parameters: {
        type: 'OBJECT',
        properties: {
          ticket_id: {
            type: 'STRING',
            description: 'ID del ticket. Si no se indica, usa el pendingCsatTicketId o activeTicketId de sesión.',
          },
          description: {
            type: 'STRING',
            description: 'Información adicional del problema. NO usar para CSAT.',
          },
          root_cause: {
            type: 'STRING',
            description: 'Usar EXCLUSIVAMENTE para CSAT: "CSAT: N/5 — comentario del cliente".',
          },
        },
        required: [],
      },
    };
  }

  async execute(args: Record<string, unknown>, session: SessionData): Promise<unknown> {
    const rawDescription = (args.description as string | undefined)?.trim() ?? '';
    const rawRootCause   = (args.root_cause  as string | undefined)?.trim() ?? '';

    const description = rawDescription.slice(0, MAX_LEN);
    const rootCause   = rawRootCause.slice(0, MAX_LEN);

    // El LLM puede corromper UUIDs al copiarlos del historial (ej: 9→3).
    // La sesión es la fuente de verdad: un ticket_id que no coincide con los
    // tickets de la sesión se descarta a favor del valor de sesión.
    // 2026-08-07: acá se leía `session.pendingCsatTicketId` en crudo. La
    // caducidad estaba puesta solo en la sección del prompt, así que un "5"
    // suelto tres horas después seguía escribiendo en el ticket viejo — el
    // modelo ni siquiera mandaba ticket_id, lo rellenaba esta línea.
    const sessionTickets = [pendingCsatVigente(session), session.activeTicketId]
      .filter((t): t is string => !!t);
    const argTicketId = (args.ticket_id as string | undefined)?.trim();

    let ticketId = argTicketId || sessionTickets[0];
    if (argTicketId && sessionTickets.length > 0 && !sessionTickets.includes(argTicketId)) {
      this.logger.warn(
        `ticket_id del modelo (${argTicketId}) no coincide con la sesión — usando ${sessionTickets[0]}`,
      );
      ticketId = sessionTickets[0];
    }

    if (!ticketId) {
      return { updated: false, error: 'No hay ticket activo para actualizar.' };
    }
    if (!description && !rootCause) {
      return { updated: false, error: 'Se requiere description o root_cause.' };
    }

    try {
      const { ticketNumber } = await this.ticketRepo.updateTicket(ticketId, description, rootCause || undefined);

      if (session.pendingCsatTicketId) {
        await this.sessionService.patchSession(session.phoneNumber, {
          pendingCsatTicketId: null,
          pendingCsatAt:       null,
        });
      }

      return {
        updated: true,
        ticketId,
        ticketNumber: customerFacingTicketRef({ Id: ticketId, TicketNumber: ticketNumber }),
        message: 'Ticket actualizado correctamente.',
      };
    } catch (err: any) {
      this.logger.error(`UpdateTicketTool error: ${err.message}`);
      return { updated: false, error: `No se pudo actualizar el ticket: ${err.message}` };
    }
  }
}
