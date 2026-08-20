import { Conversation } from '../../../database/entities/conversation.entity';

export class ConversationSummaryDto {
  id:          string;
  phoneNumber: string;
  clientName:  string | null;
  isEscalated: boolean;
  lastMessage: string | null;
  updatedAt:   string;
}

export function toConversationSummaryDto(conv: Conversation & { lastMessage?: string }): ConversationSummaryDto {
  return {
    id:          conv.id,
    phoneNumber: conv.phoneNumber,
    clientName:  conv.clientName ?? null,
    isEscalated: conv.isEscalated,
    lastMessage: conv.lastMessage ?? null,
    updatedAt:   conv.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}
