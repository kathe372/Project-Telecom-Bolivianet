import { Injectable, Logger } from '@nestjs/common';
import { CreateSupportTicketTool } from './tools/create-support-ticket.tool';
import { GetTicketVisitSlotsTool } from './tools/get-ticket-visit-slots.tool';
import { EscalateToAgentTool } from './tools/escalate-to-agent.tool';
import { ProcedureAction } from '../rag/procedure-parser';
import { SessionData, SessionService } from '../session/session.service';

export interface ResultadoAcciones {
  /** Texto a agregar al mensaje del bloque (número de ticket, etc.). */
  extra: string;
  /** Lista de horarios, si alguna acción la produjo. */
  lista?: unknown;
  /** true si TODAS las acciones salieron bien. */
  ok: boolean;
}

/**
 * Ejecuta las acciones que declara un bloque del procedimiento.
 *
 * El catálogo es CERRADO a propósito: `crear_ticket`, `ofrecer_visita`,
 * `escalar`. Una acción fuera de la lista hace que el documento se rechace al
 * subirlo, en vez de fallar con un cliente adelante.
 *
 * Regla que atraviesa todo este archivo: si una acción falla, se lo decimos.
 * Nunca se anuncia un ticket que no se creó — el error que costó más caro en
 * la auditoría de esta jornada.
 */
@Injectable()
export class ProcedureActionsService {
  private readonly logger = new Logger(ProcedureActionsService.name);

  constructor(
    private readonly crearTicket: CreateSupportTicketTool,
    private readonly horariosVisita: GetTicketVisitSlotsTool,
    private readonly escalar: EscalateToAgentTool,
    private readonly sessionService: SessionService,
  ) {}

  async ejecutar(
    acciones: ProcedureAction[], session: SessionData, textoCliente: string,
  ): Promise<ResultadoAcciones> {
    const partes: string[] = [];
    let lista: unknown;
    let ok = true;

    for (const accion of acciones) {
      try {
        const r = await this.una(accion, session, textoCliente);
        if (r.texto) partes.push(r.texto);
        if (r.lista) lista = r.lista;
        ok &&= r.ok;
      } catch (err: unknown) {
        ok = false;
        this.logger.error(JSON.stringify({
          event: 'accion_procedimiento_fallida',
          accion: accion.name, phone: session.phoneNumber, error: (err as Error).message,
        }));
        partes.push('No pude completar esa parte en el sistema. Ya avisé a un agente.');
      }
    }

    return { extra: partes.join('\n\n'), lista, ok };
  }

  private async una(
    accion: ProcedureAction, session: SessionData, textoCliente: string,
  ): Promise<{ texto?: string; lista?: unknown; ok: boolean }> {
    switch (accion.name) {
      case 'crear_ticket': {
        const r = await this.crearTicket.execute({
          issue_type:  accion.params.tipo ?? 'sin_conexion',
          description: textoCliente,
        }, session) as Record<string, unknown>;

        if (!r?.['created']) {
          return { texto: 'No pude registrar el ticket en el sistema. Ya avisé a un agente.', ok: false };
        }
        // La herramienta escribió el ticket nuevo en la sesión, pero el objeto
        // que viaja por este bloque es una copia vieja. Sin refrescarlo, la
        // acción siguiente no lo ve — medido en producción: `ofrecer_visita`
        // corría con activeTicketId en null y no llegaban los horarios.
        const fresca = await this.sessionService.getSession(session.phoneNumber);
        session.activeTicketId = fresca.activeTicketId;
        return { texto: `Registré el ticket *${r['ticketNumber']}*.`, ok: true };
      }

      case 'ofrecer_visita': {
        const r = await this.horariosVisita.execute({}, session) as Record<string, unknown>;
        if (r?.['_list']) return { lista: r['_list'], texto: '¿Qué horario te queda mejor?', ok: true };
        // Sin horarios disponibles no se promete una visita que no se agendó.
        return { texto: 'Un agente se va a comunicar con vos para coordinar la visita.', ok: true };
      }

      case 'escalar': {
        await this.escalar.execute({ motivo: 'no_se_responder', reason: textoCliente }, session);
        return { ok: true };
      }

      default:
        // No debería llegar acá: el parser rechaza acciones desconocidas.
        this.logger.error(`Acción no implementada en el ejecutor: ${accion.name}`);
        return { ok: false };
    }
  }
}
