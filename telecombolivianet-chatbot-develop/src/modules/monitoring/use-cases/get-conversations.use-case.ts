import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from '../../../database/entities/conversation.entity';
import { ConversationSummaryDto, toConversationSummaryDto } from '../dtos/conversation-summary.dto';

export interface GetConversationsQuery {
  tab:    string;
  page:   number;
  limit:  number;
}

export interface PaginatedConversations {
  total:         number;
  page:          number;
  limit:         number;
  conversations: ConversationSummaryDto[];
}

@Injectable()
export class GetConversationsUseCase {
  constructor(
    @InjectRepository(Conversation)
    private readonly convRepo: Repository<Conversation>,
  ) {}

  async execute(query: GetConversationsQuery): Promise<PaginatedConversations> {
    const qb = this.convRepo.createQueryBuilder('c').orderBy('c.updatedAt', 'DESC');

    if (query.tab === 'escaladas' || query.tab === 'en-atencion') {
      qb.where('c.isEscalated = :esc', { esc: true });
    } else if (query.tab === 'sin-responder') {
      qb.where(`EXISTS (
        SELECT 1 FROM messages m_last
        WHERE m_last.conversation_id = c.id
        AND m_last.role = 'user'
        AND m_last.created_at = (
          SELECT MAX(m_sub.created_at) FROM messages m_sub
          WHERE m_sub.conversation_id = c.id
        )
      )`);
    }

    const total = await qb.getCount();
    const items = await qb
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getMany();

    return {
      total,
      page:          query.page,
      limit:         query.limit,
      conversations: items.map(toConversationSummaryDto),
    };
  }
}
