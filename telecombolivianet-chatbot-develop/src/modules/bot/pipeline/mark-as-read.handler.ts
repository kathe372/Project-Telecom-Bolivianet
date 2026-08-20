import { Injectable, Logger } from '@nestjs/common';
import { WhatsappApiService } from '../../whatsapp/whatsapp-api.service';
import { WhatsappOutboxService } from '../../whatsapp/whatsapp-outbox.service';
import { MessageContext } from './message-context';
import { MessageHandler } from './message-handler';

@Injectable()
export class MarkAsReadHandler implements MessageHandler {
  private readonly logger = new Logger(MarkAsReadHandler.name);

  constructor(
    private readonly whatsapp: WhatsappApiService,
    private readonly outbox: WhatsappOutboxService,
  ) {}

  async handle(ctx: MessageContext, next: () => Promise<void>): Promise<void> {
    await this.whatsapp.markAsRead(ctx.messageId).catch((err: Error) => {
      this.logger.warn(`markAsRead failed for ${ctx.messageId}: ${err.message}`);
    });
    await this.outbox.tryDeliverPending(ctx.phone);
    await next();
  }
}
