import { Inject, Injectable, Logger } from '@nestjs/common';
import { ITicketRepository, TICKET_REPOSITORY } from '../../client/sistema-api.interfaces';
import { SessionService, SessionData } from '../../session/session.service';
import { AdminSignalrNotifierService } from '../../notifications/admin-signalr-notifier.service';
import { AgentTool } from './agent-tool.interface';
import { InteractiveIdCodec } from '../intents/interactive-id.codec';

/** Escala 1-5 tal como la ve el cliente. El id lleva la nota: `csat:5`. */
const CSAT_OPCIONES = [
  { score: 5, title: '⭐⭐⭐⭐⭐ Excelente' },
  { score: 4, title: '⭐⭐⭐⭐ Buena' },
  { score: 3, title: '⭐⭐⭐ Regular' },
  { score: 2, title: '⭐⭐ Mala' },
  { score: 1, title: '⭐ Muy mala' },
];
import { customerFacingTicketRef } from '../domain/ticket-reference';

@Injectable()
export class CloseSupportTicketTool implements AgentTool {
  private readonly logger = new Logger(CloseSupportTicketTool.name);

  constructor(
    @Inject(TICKET_REPOSITORY) private readonly ticketRepo: ITicketRepository,
    private readonly sessionService: SessionService,
    private readonly adminNotifier:  AdminSignalrNotifierService,
    private readonly codec:          InteractiveIdCodec,
  ) {}

  getName(): string { return 'close_support_ticket'; }
  requiresIdentification(): boolean { return false; }
  isMutating(): boolean { return true; }

  getDeclaration(): object {
    return {
      name: this.getName(),
      description:
        'Cierra el ticket de soporte activo. ' +
        'LLAMAR OBLIGATORIAMENTE cuando el cliente diga que su problema se solucionó ' +
        '("ya mejoró", "ya funciona", "se arregló", "listo", "sí mejoró", "quedó bien", etc.). ' +
        'Si no se llama, el ticket queda abierto y el próximo reporte del cliente se bloqueará.',
      parameters: {
        type: 'OBJECT',
        properties: {
          ticket_id: {
            type: 'STRING',
            description: 'ID del ticket a cerrar (opcional si hay un ticket activo en la sesión)',
          },
          resolution: {
            type: 'STRING',
            description: 'Nota de resolución del problema',
          },
        },
        required: [],
      },
    };
  }

  async execute(args: Record<string, unknown>, session: SessionData): Promise<unknown> {
    // La sesión es la fuente de verdad ante UUIDs corrompidos por el modelo.
    const argTicketId = (args.ticket_id as string | undefined)?.trim();
    let ticketId = argTicketId || session.activeTicketId;
    if (argTicketId && session.activeTicketId && argTicketId !== session.activeTicketId) {
      this.logger.warn(
        `ticket_id del modelo (${argTicketId}) no coincide con la sesión — usando ${session.activeTicketId}`,
      );
      ticketId = session.activeTicketId;
    }
    const resolution = (args.resolution as string) || 'Resuelto por el cliente via WhatsApp';

    if (!ticketId) {
      return {
        closed: false,
        error:  'No se encontró un ticket activo en la sesión. Proporciona el ID del ticket.',
      };
    }

    let ticketNumber: string | null | undefined;
    try {
      ({ ticketNumber } = await this.ticketRepo.closeTicket(ticketId, resolution));
    } catch (err: any) {
      this.logger.error(`CloseSupportTicketTool: error al cerrar ticket ${ticketId}: ${err.message}`);
      return { closed: false, error: `No se pudo cerrar el ticket: ${err.message}` };
    }

    try {
      await this.sessionService.updateSession(session.phoneNumber, {
        activeTicketId:      null,
        pendingCsatTicketId: ticketId,
        // FASE G4: sin esta marca, el CSAT pendiente no caducaba nunca y su
        // UUID seguía inyectándose en el prompt días después.
        pendingCsatAt:       Date.now(),
      });
    } catch (err: any) {
      this.logger.error(`CloseSupportTicketTool: error al actualizar sesión para ${session.phoneNumber}: ${err.message}`);
    }

    try {
      await this.adminNotifier.notifyTicketClosed({
        phoneNumber: session.phoneNumber,
        clientName:  session.clientName ?? 'Desconocido',
        ticketId,
      });
    } catch (err: any) {
      this.logger.warn(`CloseSupportTicketTool: fallo al notificar admin sobre ticket ${ticketId}: ${err.message}`);
    }

    return {
      closed:       true,
      ticketId,
      // PASO 2B: referencia segura, nunca el GUID crudo, por si el LLM la menciona.
      ticketNumber: customerFacingTicketRef({ Id: ticketId, TicketNumber: ticketNumber }),
      message:      `Ticket marcado como resuelto exitosamente.`,
      csatPending:  true,
      csatQuestion: '¿Cómo calificaría la atención recibida?',
      // 2026-08-07: antes se pedía la nota en prosa y la respuesta volvía como
      // texto libre. Cualquier número del 1 al 5 en las 2 horas siguientes
      // quedaba registrado como calificación — incluido un "5" que contestaba
      // otra pregunta. Con la lista, la nota llega como `csat:N` y no se puede
      // confundir con nada; además sólo existe si estos botones se enviaron,
      // así que la evidencia de que preguntamos viene incluida.
      _list: {
        buttonLabel: 'Calificar',
        sections: [{
          title: 'Tu calificación',
          rows: CSAT_OPCIONES.map(({ score, title }) => ({
            id:    this.codec.encodeCsat(score),
            title,
          })),
        }],
      },
    };
  }
}
