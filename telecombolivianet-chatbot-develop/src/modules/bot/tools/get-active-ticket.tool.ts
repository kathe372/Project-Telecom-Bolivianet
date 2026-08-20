import { Inject, Injectable, Logger } from '@nestjs/common';
import { ITicketRepository, TICKET_REPOSITORY } from '../../client/sistema-api.interfaces';
import { SessionData } from '../../session/session.service';
import { AgentTool } from './agent-tool.interface';

const STATUS_LABEL: Record<string, string> = {
  Abierto:          '🟡 Abierto — en espera de asignación',
  EnProceso:        '🔵 En proceso — técnico asignado',
  EnVisita:         '🟢 Técnico en visita',
  PendienteCliente: '⏸ En espera de confirmación del cliente',
  Resuelto:         '✅ Marcado como resuelto',
};

@Injectable()
export class GetActiveTicketTool implements AgentTool {
  private readonly logger = new Logger(GetActiveTicketTool.name);

  constructor(
    @Inject(TICKET_REPOSITORY) private readonly ticketRepo: ITicketRepository,
  ) {}

  getName(): string { return 'get_active_ticket'; }
  requiresIdentification(): boolean { return true; }

  getDeclaration(): object {
    return {
      name: this.getName(),
      description:
        'Consulta los tickets de soporte activos del cliente. ' +
        'Usar cuando pregunte por su reporte, ticket, solicitud, ' +
        '"cómo va mi caso", "ya atendieron mi reporte". ' +
        'NO usar para responder cuándo es una INSTALACIÓN: para eso está ' +
        'get_active_installation. Esta herramienta NO devuelve horas de cita.',
      parameters: { type: 'OBJECT', properties: {}, required: [] },
    };
  }

  async execute(_args: Record<string, unknown>, session: SessionData): Promise<unknown> {
    try {
      const tickets = await this.ticketRepo.getClientActiveTickets(session.clientId!);

      if (tickets.length === 0) {
        return { found: false, message: 'No tiene tickets de soporte activos.' };
      }

      const summary = tickets.map(t => ({
        number:     t.TicketNumber ?? t.Id.substring(0, 8).toUpperCase(),
        status:     STATUS_LABEL[t.Status] ?? t.Status,
        type:       t.Type,
        technician: t.AssignedToName ?? 'Pendiente de asignación',
        // FASE G5 (HALLAZGO 23): antes este campo se llamaba `deadline` y el
        // modelo lo narraba al cliente como la hora de la visita. Es el plazo
        // INTERNO de atención del SLA. Medido en prod: instalación agendada
        // 12:20, el bot dijo 10:20 (el vencimiento del SLA). El nombre del
        // campo es la única defensa real: el modelo lee la clave, no el docstring.
        plazo_interno_sla_NO_ES_LA_HORA_DE_LA_VISITA: t.SlaDeadline
          ? new Date(t.SlaDeadline).toLocaleString('es-BO', { timeZone: 'America/La_Paz' })
          : 'Sin fecha límite registrada',
        createdAt:  new Date(t.CreatedAt).toLocaleString('es-BO', { timeZone: 'America/La_Paz' }),
      }));

      return {
        found: true, count: tickets.length, tickets: summary,
        nota_para_el_agente:
          'PROHIBIDO informar al cliente el plazo interno del SLA como si fuera la hora de una ' +
          'visita o instalación. Si pregunta cuándo van a instalarle, llamá get_active_installation.',
      };
    } catch (err: any) {
      this.logger.error(`GetActiveTicketTool error: ${err.message}`);
      return { error: `No se pudo consultar el ticket: ${err.message}` };
    }
  }
}
