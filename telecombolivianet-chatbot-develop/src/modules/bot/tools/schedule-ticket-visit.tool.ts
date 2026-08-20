import { Inject, Injectable, Logger } from '@nestjs/common';
import { ITicketRepository, TICKET_REPOSITORY } from '../../client/sistema-api.interfaces';
import { SessionData } from '../../session/session.service';
import { AgentTool } from './agent-tool.interface';

/**
 * PASO 16 Fase C: agenda una visita técnica sobre el ticket de soporte activo
 * — mismo patrón de confirmación en dos pasos que reschedule_installation /
 * cancel_installation (PASO 12/13): sin confirmado solo valida y muestra
 * resumen con botones, nunca agenda en el mismo turno en que se elige el
 * horario.
 */
@Injectable()
export class ScheduleTicketVisitTool implements AgentTool {
  private readonly logger = new Logger(ScheduleTicketVisitTool.name);

  constructor(
    @Inject(TICKET_REPOSITORY) private readonly ticketRepo: ITicketRepository,
  ) {}

  getName(): string { return 'schedule_ticket_visit'; }
  requiresIdentification(): boolean { return true; }
  isMutating(): boolean { return true; }

  getDeclaration(): object {
    return {
      name: this.getName(),
      description:
        'Agenda una visita técnica sobre el ticket de soporte activo — en DOS pasos, nunca uno solo. ' +
        'PASO 1: llamar SIN confirmado (o confirmado=false) — valida y devuelve un resumen con ' +
        'botones de confirmación, SIN agendar todavía. PASO 2: recién cuando el cliente confirme ' +
        'explícitamente (toca "Confirmar" o dice claramente que sí), llamar de nuevo con los MISMOS ' +
        'datos y confirmado=true. La fecha/hora debe salir de un horario mostrado por ' +
        'get_ticket_visit_slots (llamarla antes si todavía no se hizo).',
      parameters: {
        type: 'OBJECT',
        properties: {
          fecha: {
            type: 'STRING',
            description: 'Fecha elegida en formato YYYY-MM-DD.',
          },
          hora: {
            type: 'STRING',
            description: 'Hora elegida en formato HH:mm (ej: 14:00).',
          },
          confirmado: {
            type: 'BOOLEAN',
            description:
              'false u omitido: solo valida y muestra el resumen con botones, no agenda nada. ' +
              'true: agenda de verdad — usar SOLO después de que el cliente confirmó explícitamente.',
          },
        },
        required: ['fecha', 'hora'],
      },
    };
  }

  async execute(args: Record<string, unknown>, session: SessionData): Promise<unknown> {
    const fecha      = (args.fecha as string) || '';
    const hora       = (args.hora  as string) || '';
    const confirmado = args.confirmado === true;
    const ticketId   = session.activeTicketId;

    if (!ticketId) {
      return { scheduled: false, error: 'No hay ningún ticket de soporte activo en esta sesión.' };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return { scheduled: false, error: 'Formato de fecha incorrecto. Usa YYYY-MM-DD.' };
    }
    if (!/^\d{2}:\d{2}$/.test(hora)) {
      return { scheduled: false, error: 'Formato de hora incorrecto. Usa HH:mm.' };
    }

    if (!confirmado) {
      return {
        scheduled: false,
        pending:   true,
        fecha, hora,
        message: `Vas a agendar una visita técnica para el ${fecha} a las ${hora}. ¿Confirmas?`,
        _quickReplies: [
          { id: 'confirmar_visita_tecnica', title: '✅ Confirmar visita' },
          { id: 'cancelar_visita_tecnica',  title: '❌ Cancelar' },
        ],
      };
    }

    try {
      await this.ticketRepo.scheduleTicketVisit(ticketId, fecha, hora);

      return {
        scheduled: true,
        fecha, hora,
        message: `Visita técnica agendada para el ${fecha} a las ${hora}. ` +
                 'Recibirás una confirmación por WhatsApp.',
      };
    } catch (err: any) {
      this.logger.error(`ScheduleTicketVisitTool error: ${err.message}`);
      return { scheduled: false, error: `No se pudo agendar la visita: ${err.message}` };
    }
  }
}
