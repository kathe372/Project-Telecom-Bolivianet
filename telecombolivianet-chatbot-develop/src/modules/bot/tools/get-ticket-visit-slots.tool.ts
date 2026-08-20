import { Inject, Injectable, Logger } from '@nestjs/common';
import { ITicketRepository, TICKET_REPOSITORY } from '../../client/sistema-api.interfaces';
import { SessionData } from '../../session/session.service';
import { AgentTool } from './agent-tool.interface';
import { InteractiveIdCodec } from '../intents/interactive-id.codec';

/**
 * PASO 16 Fase C: horarios disponibles para agendar una visita técnica sobre
 * el ticket activo de la sesión — mismo patrón que get_installation_slots
 * (lista con botones, ids codificados con InteractiveIdCodec.encodeSlot, misma
 * decodificación genérica en el orchestrator), pero acá cada slot indica si
 * cae dentro del SLA del ticket.
 */
@Injectable()
export class GetTicketVisitSlotsTool implements AgentTool {
  private readonly logger = new Logger(GetTicketVisitSlotsTool.name);

  constructor(
    @Inject(TICKET_REPOSITORY) private readonly ticketRepo: ITicketRepository,
    private readonly codec: InteractiveIdCodec,
  ) {}

  getName(): string { return 'get_ticket_visit_slots'; }
  requiresIdentification(): boolean { return true; }

  getDeclaration(): object {
    return {
      name: this.getName(),
      description:
        'Muestra los horarios disponibles para agendar una visita técnica (lista con botones), ' +
        'sobre el ticket de soporte activo del cliente. Llamar SOLO cuando corresponda ofrecer ' +
        'una visita: el problema es recurrente (check_recurring_issue devolvió recurrent:true), ' +
        'o hay indicio de fibra cortada (luz roja del router), o el cliente ya intentó las ' +
        'soluciones remotas sin éxito, o el cliente pide explícitamente una visita técnica.',
      parameters: {
        type: 'OBJECT',
        properties: {
          dias_adelante: {
            type: 'NUMBER',
            description: 'Días hacia adelante a considerar (default 5).',
          },
        },
        required: [],
      },
    };
  }

  async execute(args: Record<string, unknown>, session: SessionData): Promise<unknown> {
    const ticketId = session.activeTicketId;
    if (!ticketId) {
      return { available: false, error: 'No hay ningún ticket de soporte activo en esta sesión.' };
    }

    const diasAdelante = (args.dias_adelante as number | undefined) || 5;

    try {
      // Máximo 10 filas por límite de la lista de WhatsApp (mismo recorte que
      // get_installation_slots) — el backend puede devolver más.
      const slots = (await this.ticketRepo.getTicketVisitSlots(ticketId, diasAdelante)).slice(0, 10);

      if (slots.length === 0) {
        return {
          available: false,
          message:   'No hay horarios disponibles para los próximos días. Se puede contactar al admin.',
        };
      }

      return {
        available: true,
        slotCount: slots.length,
        slots: slots.map((s) => ({
          date:      s.Fecha,
          time:      s.HoraInicio,
          remaining: s.Disponibles,
          withinSla: s.WithinSla,
        })),
        _list: {
          buttonLabel: 'Ver horarios',
          sections: [{
            title: 'Horarios disponibles',
            rows: slots.map((s) => ({
              id:          this.codec.encodeSlot(s.Fecha, s.HoraInicio),
              title:       `${s.Fecha} ${s.HoraInicio}`,
              description: s.WithinSla
                ? `${s.Disponibles} cupo(s) disponible(s)`
                : `${s.Disponibles} cupo(s) — fuera del plazo de SLA`,
            })),
          }],
        },
      };
    } catch (err: any) {
      this.logger.error(`GetTicketVisitSlotsTool error: ${err.message}`);
      return { available: false, error: `No se pudieron obtener los horarios: ${err.message}` };
    }
  }
}
