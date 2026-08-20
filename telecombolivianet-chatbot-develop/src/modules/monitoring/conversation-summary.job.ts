import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from '../../database/entities/conversation.entity';
import { Message, MessageRole } from '../../database/entities/message.entity';
import { ConversationSummarizerService } from '../bot/conversation-summarizer.service';
import { GeminiContent } from '../session/session.service';

const IDLE_MIN_HOURS  = 2;   // antes de esto la conversación puede seguir viva
const IDLE_MAX_DAYS   = 7;   // después de esto el contexto ya es rancio
const BATCH_LIMIT     = 10;  // tope de llamadas LLM por corrida
const CONTEXT_MESSAGES = 20;

/**
 * MEJORA-1D (prerrequisito): las sesiones de Redis expiran en silencio, así que
 * el resumen de conversaciones inactivas se genera por job. Antes el summary
 * solo existía al escalar — los clientes recurrentes no tenían memoria.
 */
@Injectable()
export class ConversationSummaryJob {
  private readonly logger = new Logger(ConversationSummaryJob.name);

  constructor(
    @InjectRepository(Conversation) private readonly convRepo: Repository<Conversation>,
    @InjectRepository(Message)      private readonly msgRepo:  Repository<Message>,
    private readonly summarizer: ConversationSummarizerService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCron(): Promise<void> {
    await this.runOnce();
  }

  /** Ejecutable a demanda (POST /monitor/summarize-idle) para operación y pruebas. */
  async runOnce(): Promise<{ candidates: number; summarized: number }> {
    const candidates = await this.convRepo.createQueryBuilder('c')
      .where(`c.updated_at BETWEEN now() - interval '${IDLE_MAX_DAYS} days' AND now() - interval '${IDLE_MIN_HOURS} hours'`)
      .andWhere('(c.summary_at IS NULL OR c.summary_at < c.updated_at)')
      .orderBy('c.updated_at', 'DESC')
      .take(BATCH_LIMIT)
      .getMany();

    let summarized = 0;
    for (const conv of candidates) {
      try {
        const history = await this.loadHistory(conv.id);
        const summary = await this.summarizer.summarize(history);
        // El summarizer devuelve '' si hay <4 mensajes o falla — se marca
        // summary_at igual para no reintentar la misma conversación cada hora.
        await this.convRepo.update({ id: conv.id }, {
          ...(summary ? { summary } : {}),
          summaryAt: new Date(),
        });
        if (summary) summarized++;
      } catch (err) {
        this.logger.warn(`Resumen falló para ${conv.id}: ${(err as Error).message}`);
      }
    }

    if (candidates.length > 0) {
      this.logger.log(JSON.stringify({
        event: 'idle_conversations_summarized',
        candidates: candidates.length, summarized,
      }));
    }
    return { candidates: candidates.length, summarized };
  }

  private async loadHistory(conversationId: string): Promise<GeminiContent[]> {
    const messages = await this.msgRepo.find({
      where: { conversationId },
      order: { createdAt: 'DESC' },
      take: CONTEXT_MESSAGES,
    });
    return messages.reverse().map((m) => ({
      role:  m.role === MessageRole.USER ? 'user' as const : 'model' as const,
      parts: [{ text: m.content }],
    }));
  }
}
