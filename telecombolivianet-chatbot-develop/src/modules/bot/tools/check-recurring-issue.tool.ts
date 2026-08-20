import { Inject, Injectable } from '@nestjs/common';
import { ITicketRepository, TICKET_REPOSITORY } from '../../client/sistema-api.interfaces';
import { SessionService, SessionData } from '../../session/session.service';
import { AgentTool } from './agent-tool.interface';
import { ISSUE_TYPE_MAP } from '../domain/issue-type-map';

/**
 * PASO 16 Fase A (2026-08): detecta si el cliente ya reportó el MISMO tipo de
 * problema recientemente — si es así, el autodiagnóstico ya se intentó antes
 * y no alcanzó, así que no tiene sentido repetirlo (ver tech-support-flow.section.ts).
 * `recurrent = recentCount >= 1`: la SEGUNDA vez que pasa lo mismo ya cuenta
 * como recurrente, no la tercera.
 */

/**
 * FASE D1 (2026-08-07): el prompt ya ordena consultar la base antes de dar
 * pasos de autodiagnóstico, y no alcanza. Cuatro reproducciones de cuatro:
 * "mi internet está lento" → 960 caracteres de pasos INVENTADOS, con chunk_id
 * en NULL — es decir, sin ningún respaldo de la base de conocimiento.
 *
 * La información SÍ estaba: los chunks 4, 5 y 6 de SOPORTE TECNICO responden
 * exactamente esa pregunta.
 *
 * Un prompt de sistema es débil frente al resultado de una herramienta: el
 * modelo obedece mucho mejor una instrucción que llega DENTRO del resultado de
 * la tool que acaba de llamar, porque es inmediata y local. Ese patrón ya
 * funciona acá — el mensaje de error de plan_id inválido logra que se
 * autocorrija (ver change-plan.tool.ts).
 */
const SIGUIENTE_PASO =
  'ANTES de responder, llamá search_knowledge_base con la descripción del problema del cliente. ' +
  'PROHIBIDO redactar pasos de autodiagnóstico por tu cuenta: usá SOLO lo que devuelva esa ' +
  'herramienta, aunque creas saber la respuesta. ' +
  'Si no devuelve nada, creá el ticket con create_support_ticket — no inventes.';
// Nota (2026-08-07): una versión anterior de esta instrucción prohibía nombrar
// speedtest.net por considerarlo inventado. Medido contra la base: el chunk 9
// de SOPORTE TECNICO lo recomienda explícitamente ("podés medir la velocidad
// desde fast.com o speedtest.net"). Prohibirlo habría hecho que el bot
// contradijera su propia documentación aprobada. La regla correcta no es "no
// nombres sitios externos" sino "no digas nada que no venga de la herramienta".

const SIGUIENTE_PASO_RECURRENTE =
  'El problema ya se intentó resolver antes y volvió. NO ofrezcas pasos de autodiagnóstico ni ' +
  'consultes la base: creá el ticket directo con create_support_ticket y avisale al cliente que, ' +
  'por ser recurrente, es probable que haga falta una visita técnica.';

@Injectable()
export class CheckRecurringIssueTool implements AgentTool {
  constructor(
    @Inject(TICKET_REPOSITORY) private readonly ticketRepo: ITicketRepository,
    private readonly sessionService: SessionService,
  ) {}

  getName(): string { return 'check_recurring_issue'; }
  requiresIdentification(): boolean { return true; }
  isMutating(): boolean { return false; }

  getDeclaration(): object {
    return {
      name: this.getName(),
      description:
        'Verifica si el cliente ya reportó el MISMO tipo de problema técnico o de TV recientemente. ' +
        'Llamar SIEMPRE como PRIMER paso al identificar el issue_type de un reclamo técnico o de TV, ' +
        'ANTES de search_knowledge_base — salvo que ya se haya llamado antes en esta conversación ' +
        'para el mismo tipo de problema. ' +
        'Si recurrent:true, el problema ya se intentó resolver antes y volvió — NO ofrezcas pasos de ' +
        'autodiagnóstico, creá el ticket directo con create_support_ticket y avisale al cliente que, ' +
        'por ser un problema recurrente, es probable que haga falta una visita técnica.',
      parameters: {
        type: 'OBJECT',
        properties: {
          issue_type: {
            type: 'STRING',
            enum: Object.keys(ISSUE_TYPE_MAP),
            description:
              'Tipo de problema detectado en la conversación — mismo valor que usarías en create_support_ticket.',
          },
        },
        required: ['issue_type'],
      },
    };
  }

  async execute(args: Record<string, unknown>, session: SessionData): Promise<unknown> {
    const issueType = (args.issue_type as string) || 'sin_conexion';
    const mapped    = ISSUE_TYPE_MAP[issueType] ?? ISSUE_TYPE_MAP.sin_conexion;

    // Ya se chequeó este mismo tipo antes en la conversación — no repetir la
    // consulta al backend (PASO 7: evitar llamadas de más que empeoren la latencia).
    if (session.recentTicketCheck?.type === mapped.type) {
      return {
        recurrent:    session.recentTicketCheck.recurrent,
        recentCount:  session.recentTicketCheck.recentCount,
        cached:       true,
        // También en el camino cacheado: si la instrucción solo viajara en la
        // primera llamada, el segundo turno volvería a inventar pasos.
        siguiente_paso_obligatorio: session.recentTicketCheck.recurrent
          ? SIGUIENTE_PASO_RECURRENTE
          : SIGUIENTE_PASO,
      };
    }

    const recentCount = await this.ticketRepo.getRecentTicketCount(session.clientId!, mapped.type);
    const recurrent   = recentCount >= 1;

    await this.sessionService.updateSession(session.phoneNumber, {
      recentTicketCheck: { type: mapped.type, recurrent, recentCount },
    });

    return {
      recurrent,
      recentCount,
      siguiente_paso_obligatorio: recurrent ? SIGUIENTE_PASO_RECURRENTE : SIGUIENTE_PASO,
    };
  }
}
