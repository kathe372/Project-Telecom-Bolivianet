import { Conversation } from '../../../database/entities/conversation.entity';

export interface CreateMessageDto {
  role:    'user' | 'bot' | 'admin';
  content: string;
  source?: string;
}

export interface IConversationStore {
  findOrCreate(phone: string, clientName?: string | null): Promise<Conversation>;
  addMessage(convId: string, msg: CreateMessageDto): Promise<void>;
  markEscalated(convId: string, agentName: string): Promise<void>;
}

export const CONVERSATION_STORE = Symbol('CONVERSATION_STORE');
