import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from '../../../database/entities/conversation.entity';
import { Message, MessageRole, MessageSource } from '../../../database/entities/message.entity';
import { IConversationStore, CreateMessageDto } from '../ports/conversation-store.port';

@Injectable()
export class TypeOrmConversationStore implements IConversationStore {
  constructor(
    @InjectRepository(Conversation) private readonly convRepo: Repository<Conversation>,
    @InjectRepository(Message)      private readonly msgRepo:  Repository<Message>,
  ) {}

  async findOrCreate(phone: string, clientName?: string | null): Promise<Conversation> {
    let conv = await this.convRepo.findOne({ where: { phoneNumber: phone } });
    if (!conv) {
      conv = this.convRepo.create({ phoneNumber: phone, clientName: clientName ?? null });
      await this.convRepo.save(conv);
    } else if (clientName && conv.clientName !== clientName) {
      conv.clientName = clientName;
      await this.convRepo.save(conv);
    }
    return conv;
  }

  async addMessage(convId: string, dto: CreateMessageDto): Promise<void> {
    const msg = this.msgRepo.create({
      conversationId: convId,
      role:    dto.role as MessageRole,
      content: dto.content,
      source:  (dto.source as MessageSource) ?? MessageSource.SYSTEM,
    });
    await this.msgRepo.save(msg);
  }

  async markEscalated(convId: string, agentName: string): Promise<void> {
    await this.convRepo.update(convId, {
      isEscalated: true,
      escalatedAt: new Date(),
      agentName,
    });
  }
}
