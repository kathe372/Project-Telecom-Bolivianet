import { Injectable, Logger } from '@nestjs/common';
import { SessionData } from '../../session/session.service';
import { AgentTool, ESCALATE_TOOL } from './agent-tool.interface';

/**
 * Motivos de escalación. Estructurado a propósito, no texto libre.
 *
 * Medido en producción (2026-08-07): al cliente que preguntó "¿el router es mío
 * o prestado?" el bot le respondió "voy a escalar tu consulta a un agente
 * especializado" — SIN haber llamado a search_knowledge_base. La respuesta
 * estaba en la base y recuperaba en primera posición.
 *
 * Y la consecuencia no terminó ahí: la escalación marca la conversación como
 * `is_escalated`, y el bot deja de responder. Los dos mensajes siguientes del
 * cliente no generaron ni un solo agent_run. Un error de criterio se convirtió
 * en pérdida de servicio hasta que alguien liberara la conversación a mano.
 */
export const MOTIVOS_ESCALACION = [
  'pedido_explicito',        // el cliente pidió hablar con una persona
  'cliente_molesto',         // segunda vez enojado y sin solución
  'cobertura_no_verificada', // check_coverage devolvió "unverified"
  'no_se_responder',         // no encontré la respuesta — EXIGE haber buscado
] as const;

export const ESCALACION_SIN_BUSCAR =
  'NO se puede escalar por "no_se_responder" sin haber consultado antes la base de conocimiento. ' +
  'Llamá AHORA a search_knowledge_base con la pregunta del cliente. ' +
  'Si esa herramienta no devuelve nada útil, recién entonces escalá con este mismo motivo. ' +
  'Declararte incapaz sin haber buscado deja al cliente sin respuesta a algo que sí está documentado.';

@Injectable()
export class EscalateToAgentTool implements AgentTool {
  private readonly logger = new Logger(EscalateToAgentTool.name);

  getName(): string { return ESCALATE_TOOL; }
  requiresIdentification(): boolean { return false; }
  isMutating(): boolean { return true; }

  getDeclaration(): object {
    return {
      name: this.getName(),
      description:
        'Transfiere la conversación a un agente humano. ' +
        'Usar en estos cuatro casos: ' +
        '(1) el cliente pide EXPLÍCITAMENTE hablar con una persona ("agente", "operadora", "humano"); ' +
        '(2) el cliente está muy enojado por segunda vez Y no hay solución disponible; ' +
        '(3) check_coverage devuelve covered:"unverified" y el cliente quiere continuar; ' +
        '(4) el cliente hace una pregunta sobre políticas, procedimientos o condiciones ' +
        'que NO están en tus herramientas NI en la base de conocimiento — pero para eso ' +
        'primero TENÉS que haber llamado a search_knowledge_base y que no haya devuelto nada. ' +
        'NUNCA escalar solo por errores técnicos temporales de herramientas — informa el error y ofrece reintentar.',
      parameters: {
        type: 'OBJECT',
        properties: {
          motivo: {
            type: 'STRING',
            enum: [...MOTIVOS_ESCALACION],
            description:
              'pedido_explicito: pidió hablar con una persona. ' +
              'cliente_molesto: enojado por segunda vez y sin solución. ' +
              'cobertura_no_verificada: check_coverage devolvió "unverified". ' +
              'no_se_responder: no encontraste la respuesta — solo válido DESPUÉS de ' +
              'haber llamado a search_knowledge_base sin resultado.',
          },
          reason: {
            type: 'STRING',
            description: 'Detalle en tus palabras de por qué escalás',
          },
        },
        required: ['motivo'],
      },
    };
  }

  execute(args: Record<string, unknown>, session: SessionData): Promise<unknown> {
    const reason = (args.reason as string) || 'Solicitud del cliente o situación no resuelta por el bot';
    const deferred = !session.humanAvailable;

    // El guardia real está en el registry, que es quien sabe qué herramientas
    // corrieron en el turno. Acá se deja la marca para que aquel pueda decidir.
    const motivo = (args.motivo as string) || 'no_se_responder';

    this.logger.log(
      `Escalación solicitada. Motivo: ${motivo} (${reason}) | ` +
      `Modo: ${deferred ? 'DIFERIDO (fuera de ventana humana)' : 'EN VIVO'}`,
    );

    if (deferred) {
      return Promise.resolve({
        queued:   true,
        deferred: true,
        reason,
        motivo,
        message:
          'Tu solicitud quedó registrada. Un agente te contactará en nuestro ' +
          'horario de atención. 🙏',
        note: 'NO prometas al cliente un día ni hora específica de contacto.',
      });
    }

    return Promise.resolve({
      queued:   true,
      deferred: false,
      reason,
      motivo,
      message: 'Solicitud de transferencia a agente humano registrada.',
      note: 'NO prometas al cliente un día ni hora específica de contacto.',
    });
  }
}
