import { Inject, Injectable, Logger } from '@nestjs/common';
import { ITicketRepository, TICKET_REPOSITORY } from '../../client/sistema-api.interfaces';
import { AdminSignalrNotifierService } from '../../notifications/admin-signalr-notifier.service';
import { SessionData } from '../../session/session.service';
import { AgentTool } from './agent-tool.interface';
import { customerFacingTicketRef } from '../domain/ticket-reference';

@Injectable()
export class RescheduleTicketTool implements AgentTool {
  private readonly logger = new Logger(RescheduleTicketTool.name);

  constructor(
    @Inject(TICKET_REPOSITORY) private readonly ticketRepo: ITicketRepository,
    private readonly adminNotifier: AdminSignalrNotifierService,
  ) {}

  getName(): string { return 'reschedule_ticket'; }
  requiresIdentification(): boolean { return false; }
  isMutating(): boolean { return true; }

  getDeclaration(): object {
    return {
      name: this.getName(),
      description:
        'Reagenda la visita técnica de un ticket de soporte activo. ' +
        'Usar cuando el cliente quiera cambiar la fecha u hora de la visita del técnico. ' +
        'Si el cliente no proporciona fecha u hora, pregúntale antes de llamar esta herramienta.',
      parameters: {
        type: 'OBJECT',
        properties: {
          fecha: {
            type: 'STRING',
            description: 'Nueva fecha para la visita técnica en formato YYYY-MM-DD',
          },
          hora: {
            type: 'STRING',
            description: 'Nueva hora para la visita técnica en formato HH:mm (ej: 10:00)',
          },
          ticket_id: {
            type: 'STRING',
            description: 'ID del ticket a reagendar. Si no se proporciona, se usa el ticket activo de la sesión.',
          },
        },
        required: ['fecha', 'hora'],
      },
    };
  }

  async execute(args: Record<string, unknown>, session: SessionData): Promise<unknown> {
    // P2.2 (auditoría 2026-08): mismo guard que ya tienen update_ticket y
    // close_support_ticket — la sesión es la fuente de verdad ante un
    // ticket_id corrompido/inventado por el modelo.
    const argTicketId = (args.ticket_id as string | undefined)?.trim();
    let ticketId = argTicketId || session.activeTicketId || undefined;
    if (argTicketId && session.activeTicketId && argTicketId !== session.activeTicketId) {
      this.logger.warn(
        `ticket_id del modelo (${argTicketId}) no coincide con la sesión — usando ${session.activeTicketId}`,
      );
      ticketId = session.activeTicketId;
    }
    const fecha = (args.fecha as string) || '';
    const hora  = (args.hora  as string) || '';

    if (!ticketId) return { rescheduled: false, error: 'No hay un ticket activo en la sesión para reagendar.' };
    if (!fecha || !hora) return { rescheduled: false, error: 'Se requiere fecha (YYYY-MM-DD) y hora (HH:mm) para reagendar.' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { rescheduled: false, error: 'Formato de fecha incorrecto. Usa YYYY-MM-DD (ej: 2025-05-15).' };
    if (!/^\d{2}:\d{2}$/.test(hora))         return { rescheduled: false, error: 'Formato de hora incorrecto. Usa HH:mm (ej: 10:00).' };

    try {
      const { ticketNumber } = await this.ticketRepo.rescheduleTicket(ticketId, fecha, hora);
      // PASO 2B: nunca interpolar el GUID crudo en el texto para el cliente.
      const ticketRef = customerFacingTicketRef({ Id: ticketId, TicketNumber: ticketNumber });
      await this.adminNotifier.notifyTicketRescheduled({
        phoneNumber: session.phoneNumber,
        clientName:  session.clientName ?? 'Desconocido',
        ticketId,
        fecha,
        hora,
      });

      return {
        rescheduled: true,
        ticketId,
        ticketNumber: ticketRef,
        fecha,
        hora,
        message: `Visita técnica del ticket ${ticketRef} reagendada para el ${fecha} a las ${hora}.`,
      };
    } catch (err: any) {
      this.logger.error(`RescheduleTicketTool error: ${err.message}`);
      return { rescheduled: false, error: `No se pudo reagendar la visita: ${err.message}` };
    }
  }
}
