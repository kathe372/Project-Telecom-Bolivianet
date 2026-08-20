import { Injectable, Logger } from '@nestjs/common';
import { RagService } from '../../rag/rag.service';
import { SessionData } from '../../session/session.service';
import { AgentTool } from './agent-tool.interface';

@Injectable()
export class SearchKnowledgeBaseTool implements AgentTool {
  private readonly logger = new Logger(SearchKnowledgeBaseTool.name);

  // FASE 2.1: ya no depende de SessionService — la búsqueda usa solo la
  // pregunta que redactó el modelo (ver comentario en execute()).
  constructor(
    private readonly ragService: RagService,
  ) {}

  getName(): string { return 'search_knowledge_base'; }
  requiresIdentification(): boolean { return false; }

  getDeclaration(): object {
    return {
      name: this.getName(),
      description:
        'Busca información en la base de conocimiento de la empresa. ' +
        'Usar para preguntas sobre políticas, condiciones de servicio, ' +
        'pasos de soporte técnico documentado, cobertura, o preguntas informativas generales. ' +
        'Para precios y planes actuales usa get_available_plans (datos en tiempo real).',
      parameters: {
        type: 'OBJECT',
        properties: {
          query: {
            type: 'STRING',
            description: 'La pregunta o tema a buscar',
          },
        },
        required: ['query'],
      },
    };
  }

  async execute(args: Record<string, unknown>, session: SessionData): Promise<unknown> {
    const query = (args.query as string) || '';
    if (!query.trim()) return { found: false, error: 'Se requiere una consulta para buscar.' };

    try {
      // FASE 2.1 (2026-08-06): antes se pasaba getContextText(), o sea la
      // conversación ENTERA. Ese texto se concatenaba a la pregunta y se
      // vectorizaba, así que el vector de búsqueda terminaba siendo un
      // "promedio" de todo lo hablado y no de lo que el cliente preguntó: si
      // venía hablando de su factura y ahora pregunta cómo reiniciar el
      // router, el chunk del router podía caer por debajo del umbral 0.75.
      //
      // Es redundante además de dañino: el argumento `query` NO lo escribe el
      // cliente, lo redacta el modelo, que ya tiene la conversación completa
      // en su contexto y la resume en una pregunta autocontenida.
      //
      // Efecto secundario bueno: con contexto vacío, RagService reutiliza el
      // embedding de la pregunta en vez de generar uno nuevo (BUG-R4) — una
      // llamada menos a Gemini por cada consulta a la base de conocimiento.
      const result = await this.ragService.query(query, '');

      if (!result.found) {
        return {
          found:   false,
          message: 'No encontré información específica en la base de conocimiento para esa consulta.',
        };
      }

      const isTechIssue = /internet|conexi[oó]n|router|m[oó]dem|lent|se[ñn]al|tv|cable|cort|deco/i.test(query);

      return {
        found:      true,
        answer:     result.answer,
        chunkId:    result.chunkId,
        similarity: result.similarity,
        // MEJORA-1C: tras dar pasos de soporte, botones para confirmar resolución
        ...(isTechIssue && {
          _quickReplies: [
            { id: 'problema_resuelto', title: '✅ Se resolvió' },
            { id: 'problema_persiste', title: '❌ Sigue igual' },
          ],
        }),
      };
    } catch (err: any) {
      this.logger.error(`SearchKnowledgeBaseTool error: ${err.message}`);
      return { found: false, error: `Error en la búsqueda: ${err.message}` };
    }
  }
}
