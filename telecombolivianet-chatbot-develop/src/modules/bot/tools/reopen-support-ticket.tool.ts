import { Inject, Injectable, Logger } from '@nestjs/common';
import { ITicketRepository, TICKET_REPOSITORY } from '../../client/sistema-api.interfaces';
import { SessionService, SessionData } from '../../session/session.service';
import { AdminSignalrNotifierService } from '../../notifications/admin-signalr-notifier.service';
import { AgentTool } from './agent-tool.interface';
import { customerFacingTicketRef } from '../domain/ticket-reference';

@Injectable()
export class ReopenSupportTicketTool implements AgentTool {
  private readonly logger = new Logger(ReopenSupportTicketTool.name);

  constructor(
    @Inject(TICKET_REPOSITORY) private readonly ticketRepo: ITicketRepository,
    private readonly sessionService: SessionService,
    private readonly adminNotifier:  AdminSignalrNotifierService,
  ) {}

  getName(): string { return 'reopen_support_ticket'; }
  requiresIdentification(): boolean { return true; }
  isMutating(): boolean { return true; }

  getDeclaration(): object {
    return {
      name: this.getName(),
      description:
        'Reabre el ticket de soporte más reciente cuando el mismo problema vuelve a ocurrir. ' +
        'Usar cuando el cliente diga que el problema regresó, que el técnico no lo solucionó, ' +
        'o que la falla es intermitente después de marcarse como resuelta. ' +
        'SOLO usar si hay un ticket reciente en estado Resuelto. ' +
        'Si no hay ticket previo, usar create_support_ticket.',
      parameters: {
        type: 'OBJECT',
        properties: {
          ticket_id: {
            type: 'STRING',
            description: 'ID del ticket a reabrir (opcional si está en sesión)',
          },
          description: {
            type: 'STRING',
            description: 'Descripción del problema recurrente',
          },
        },
        required: ['description'],
      },
    };
  }

  async execute(args: Record<string, unknown>, session: SessionData): Promise<unknown> {
    const description = (args.description as string) || 'El cliente reporta que el problema persiste';

    // P2.2 (auditoría 2026-08): mismo guard que ya tienen update_ticket y
    // close_support_ticket — el LLM puede corromper/inventar un UUID al
    // copiarlo del historial. La sesión es la fuente de verdad: si el
    // modelo manda un ticket_id que no coincide con el de sesión, se
    // descarta a favor del valor de sesión.
    const argTicketId = (args.ticket_id as string | undefined)?.trim();
    let ticketId = argTicketId || session.activeTicketId || undefined;
    if (argTicketId && session.activeTicketId && argTicketId !== session.activeTicketId) {
      this.logger.warn(
        `ticket_id del modelo (${argTicketId}) no coincide con la sesión — usando ${session.activeTicketId}`,
      );
      ticketId = session.activeTicketId;
    }

    if (!ticketId) {
      try {
        const tickets  = await this.ticketRepo.getClientActiveTickets(session.clientId!);
        const resolved = tickets.find(t => t.Status === 'Resuelto');
        if (!resolved) {
          return {
            reopened: false,
            message:  'No encontré un ticket resuelto recientemente para reabrir. ' +
                      '¿Deseas que cree un nuevo ticket de soporte?',
          };
        }
        ticketId = resolved.Id;
      } catch (err: any) {
        return { reopened: false, error: `No se pudo buscar tickets: ${err.message}` };
      }
    }

    try {
      const { ticketNumber } = await this.ticketRepo.reopenTicket(ticketId, description);
      await this.sessionService.updateSession(session.phoneNumber, { activeTicketId: ticketId });
      await this.adminNotifier.notifyTicketCreated({
        phoneNumber: session.phoneNumber,
        clientName:  session.clientName ?? 'Desconocido',
        ticketId,
        priority:    'Alta',
      });
      return {
        reopened: true,
        ticketId,
        ticketNumber: customerFacingTicketRef({ Id: ticketId, TicketNumber: ticketNumber }),
        message:  'Tu ticket fue reabierto con prioridad alta. El técnico revisará nuevamente tu caso.',
      };
    } catch (err: any) {
      this.logger.error(`ReopenSupportTicketTool error: ${err.message}`);
      return { reopened: false, error: `No se pudo reabrir el ticket: ${err.message}` };
    }
  }
}
