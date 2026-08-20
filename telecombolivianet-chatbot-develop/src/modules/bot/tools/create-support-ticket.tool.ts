import { Inject, Injectable, Logger } from '@nestjs/common';
import { ITicketRepository, TICKET_REPOSITORY } from '../../client/sistema-api.interfaces';
import { SessionService, SessionData } from '../../session/session.service';
import { AdminSignalrNotifierService } from '../../notifications/admin-signalr-notifier.service';
import { AgentTool } from './agent-tool.interface';
import { customerFacingTicketRef } from '../domain/ticket-reference';
import { ISSUE_TYPE_MAP } from '../domain/issue-type-map';


@Injectable()
export class CreateSupportTicketTool implements AgentTool {
  private readonly logger = new Logger(CreateSupportTicketTool.name);

  constructor(
    @Inject(TICKET_REPOSITORY) private readonly ticketRepo: ITicketRepository,
    private readonly sessionService: SessionService,
    private readonly adminNotifier:  AdminSignalrNotifierService,
  ) {}

  getName(): string { return 'create_support_ticket'; }
  requiresIdentification(): boolean { return true; }
  isMutating(): boolean { return true; }

  getDeclaration(): object {
    return {
      name: this.getName(),
      description:
        'Crea un ticket de soporte técnico. ' +
        'IMPORTANTE: usa primero search_knowledge_base para ofrecer pasos de autodiagnóstico. ' +
        'Solo crea el ticket si: (a) el cliente ya intentó los pasos y el problema persiste, ' +
        'o (b) la base de conocimiento no tiene información relevante, ' +
        'o (c) el cliente pide explícitamente que se cree un ticket.',
      parameters: {
        type: 'OBJECT',
        properties: {
          issue_type: {
            type: 'STRING',
            enum: [
              'sin_conexion', 'velocidad_lenta', 'problema_router', 'cable_cortado',
              'sin_senal_tv', 'problema_decoder', 'solicitar_reactivacion',
            ],
            description: 'Tipo de problema detectado en la conversación',
          },
          description: {
            type: 'STRING',
            description: 'Descripción del problema en palabras del cliente',
          },
          force_new: {
            type: 'BOOLEAN',
            description: 'true para crear un nuevo ticket aunque ya exista uno activo (usar solo si el cliente lo confirma explícitamente)',
          },
        },
        required: ['issue_type', 'description'],
      },
    };
  }

  async execute(args: Record<string, unknown>, session: SessionData): Promise<unknown> {
    if (session.activeTicketId && !args.force_new) {
      // BUG-02: no confiar en session.activeTicketId (puede ser un "ticket
      // fantasma" de una sesión previa cuyo ticket ya se cerró). Validar contra
      // el backend, como hace change_plan. Si sigue abierto → dedup; si no →
      // limpiar el id obsoleto y proceder a crear el ticket nuevo.
      let sigueAbierto = false;
      // PASO 2B: si sigue abierto, la referencia que se le muestra al cliente
      // debe ser el número legible, no el GUID crudo de session.activeTicketId.
      let ticketRef = session.activeTicketId ?? '';
      try {
        const activos = await this.ticketRepo.getClientActiveTickets(session.clientId!);
        const existente = activos.find(t => t.Id === session.activeTicketId);
        sigueAbierto = !!existente;
        if (existente) ticketRef = customerFacingTicketRef(existente);
      } catch (err: any) {
        // Ante fallo de la consulta, mantener el comportamiento conservador (dedup).
        this.logger.warn(`No se pudo validar ticket activo, se asume vigente: ${err.message}`);
        sigueAbierto = true;
      }

      if (sigueAbierto) {
        return {
          created:          false,
          existingTicketId: session.activeTicketId,
          message:
            `Ya tienes un ticket activo (${ticketRef}). ` +
            `¿Confirmas que quieres abrir uno nuevo de todas formas? ` +
            `Si es así, indica que deseas crear un nuevo ticket.`,
        };
      }

      await this.sessionService.updateSession(session.phoneNumber, { activeTicketId: null });
    }

    const issueType   = (args.issue_type   as string) || 'sin_conexion';
    const description = (args.description  as string) || 'Sin descripción';
    const mapped      = ISSUE_TYPE_MAP[issueType] ?? ISSUE_TYPE_MAP.sin_conexion;

    try {
      const ticket = await this.ticketRepo.createTicket({
        ClientId:         session.clientId!,
        Subject:          this.ticketRepo.buildTicketSubject({
          type:       mapped.type,
          tbnCode:    session.tbnCode    || 'NUEVO',
          clientName: session.clientName || 'Cliente',
          priority:   mapped.priority,
        }),
        Type:             mapped.type,
        Priority:         mapped.priority,
        Description:      `Reporte via WhatsApp (bot IA): ${description}`,
        Origin:           'Bot',
        AutoAssign:       true,
      });

      // PASO 2B: antes caía al GUID completo si TicketNumber faltaba; ahora
      // usa el mismo fragmento corto y seguro que el resto de las tools.
      const ticketRef = customerFacingTicketRef(ticket);
      await this.sessionService.updateSession(session.phoneNumber, { activeTicketId: ticket.Id });

      if (mapped.priority === 'Alta') {
        await this.adminNotifier.notifyHighPriorityTicket({
          phoneNumber: session.phoneNumber,
          clientName:  session.clientName ?? 'Desconocido',
          ticketId:    ticketRef,
          description,
        });
      } else {
        await this.adminNotifier.notifyTicketCreated({
          phoneNumber: session.phoneNumber,
          clientName:  session.clientName ?? 'Desconocido',
          ticketId:    ticketRef,
          priority:    mapped.priority,
        });
      }

      // 2026-08-07: se dejó de prometerle un plazo al cliente.
      //
      // El número salía del DueDate real del backend (calculado con la
      // configuración de SLA del admin), así que era correcto — pero es una
      // promesa que el sistema no puede garantizar: el SLA es un objetivo
      // interno de gestión, no un compromiso con el cliente. Visto en
      // producción: "un técnico se pondrá en contacto en las próximas 124
      // horas". El vencimiento se sigue guardando en el backend, que es de
      // donde lo leen el panel y los reportes.

      return {
        created:      true,
        ticketNumber: ticketRef,
        priority:     mapped.priority,
        // `dueDate` NO se le devuelve al modelo. Sacar la frase del mensaje no
        // alcanzaba: visto en producción, con el dato crudo a la vista el modelo
        // calculaba las horas por su cuenta y volvía a decir "en las próximas 8
        // horas". El vencimiento vive en el backend, que es de donde lo leen el
        // panel y los reportes.
        issueType,
        message:
          `Ticket ${ticketRef} registrado con prioridad ${mapped.priority}. ` +
          `Un técnico se pondrá en contacto contigo lo antes posible.`,
      };
    } catch (err: any) {
      this.logger.error(`CreateSupportTicketTool error: ${err.message}`);
      return { created: false, error: `No se pudo crear el ticket: ${err.message}` };
    }
  }
}
