import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from '../../database/entities/conversation.entity';

export interface ReturningContext {
  summary: string;
  summaryAt: number;
}

/**
 * MEJORA-1D: contexto de la conversación anterior para clientes que vuelven
 * después de que su sesión de Redis expiró (TTL 24h). La identidad ya se
 * restaura por teléfono en cada mensaje; esto restaura DE QUÉ hablaron.
 */
@Injectable()
export class ConversationMemoryService {
  private readonly logger = new Logger(ConversationMemoryService.name);

  constructor(
    @InjectRepository(Conversation) private readonly convRepo: Repository<Conversation>,
  ) {}

  async loadReturningContext(phone: string): Promise<ReturningContext | null> {
    try {
      const conv = await this.convRepo.findOne({
        where: { phoneNumber: phone },
        select: ['summary', 'summaryAt'],
      });
      if (!conv?.summary?.trim()) return null;
      return {
        summary:   conv.summary.trim(),
        summaryAt: (conv.summaryAt ?? new Date()).getTime(),
      };
    } catch (err) {
      // La memoria es un extra: si falla, la conversación sigue sin contexto previo.
      this.logger.warn(`loadReturningContext(${phone}): ${(err as Error).message}`);
      return null;
    }
  }
}
