import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SessionService, SessionData } from '../../session/session.service';
import { WhatsappApiService } from '../../whatsapp/whatsapp-api.service';
import { WhatsappOutboxService } from '../../whatsapp/whatsapp-outbox.service';
import { MessageSource } from '../../../database/entities/message.entity';
import { MessagePersistenceService } from './message-persistence.service';
import { InteractiveReplyBuilder, QuickReply, ListSection } from '../interactive-reply.builder';

@Injectable()
export class MessageSenderService {
  private readonly logger = new Logger(MessageSenderService.name);
  private readonly retryDelayMs: number;

  constructor(
    private readonly session:      SessionService,
    private readonly whatsapp:     WhatsappApiService,
    private readonly outbox:       WhatsappOutboxService,
    private readonly persistence:  MessagePersistenceService,
    private readonly config:       ConfigService,
    private readonly replyBuilder: InteractiveReplyBuilder,
  ) {
    this.retryDelayMs = config.get<number>('whatsapp.sendRetryDelayMs') ?? 3_000;
  }

  /**
   * MEJORA-1C: envío con botones interactivos, con la MISMA resiliencia que el
   * texto: si los botones fallan (ventana de 24h vencida, API vieja), degrada a
   * texto plano numerado por el camino retry→outbox de send().
   */
  async sendWithQuickReplies(
    session: SessionData,
    text: string,
    replies: QuickReply[],
    source: MessageSource = MessageSource.SYSTEM,
    chunkId?: string,
  ): Promise<void> {
    const interactive = this.replyBuilder.build(text, replies);
    if (!interactive) {
      await this.send(session, text, source, chunkId);
      return;
    }

    await this.session.addMessage(session.phoneNumber, 'bot', text);
    await this.persistence.persistMessage(session, 'bot', text, source, chunkId);

    try {
      await this.whatsapp.sendButtons(session.phoneNumber, interactive.body, interactive.buttons);
    } catch (err) {
      this.logger.warn(JSON.stringify({
        event: 'buttons_send_failed_fallback_text',
        phone: session.phoneNumber,
        error: String(err),
      }));
      const fallback =
        `${text}\n\n` +
        interactive.buttons.map((b, i) => `${i + 1}. ${b.title}`).join('\n');
      await this.deliverWithRetry(session.phoneNumber, fallback);
    }
  }

  /**
   * PASO 8: mismo patrón/resiliencia que sendWithQuickReplies, para listas
   * dinámicas (planes, horarios) — si sendList falla, degrada a texto plano
   * numerado por el mismo camino retry→outbox.
   */
  async sendWithList(
    session: SessionData,
    text: string,
    list: { buttonLabel: string; sections: ListSection[] },
    source: MessageSource = MessageSource.SYSTEM,
    chunkId?: string,
  ): Promise<void> {
    const interactive = this.replyBuilder.buildList(text, list.sections, list.buttonLabel);
    if (!interactive) {
      await this.send(session, text, source, chunkId);
      return;
    }

    await this.session.addMessage(session.phoneNumber, 'bot', text);
    await this.persistence.persistMessage(session, 'bot', text, source, chunkId);

    try {
      await this.whatsapp.sendList(session.phoneNumber, interactive.body, interactive.buttonLabel, interactive.sections);
    } catch (err) {
      this.logger.warn(JSON.stringify({
        event: 'list_send_failed_fallback_text',
        phone: session.phoneNumber,
        error: String(err),
      }));
      const rows = interactive.sections.flatMap((s) => s.rows);
      const fallback = `${text}\n\n${rows.map((r, i) => `${i + 1}. ${r.title}`).join('\n')}`;
      await this.deliverWithRetry(session.phoneNumber, fallback);
    }
  }

  async send(
    session: SessionData,
    text: string,
    source: MessageSource = MessageSource.SYSTEM,
    chunkId?: string,
  ): Promise<void> {
    await this.session.addMessage(session.phoneNumber, 'bot', text);
    await this.persistence.persistMessage(session, 'bot', text, source, chunkId);
    await this.deliverWithRetry(session.phoneNumber, text);
  }

  /** Entrega texto con 1 reintento y outbox de respaldo (compartido por texto y botones). */
  private async deliverWithRetry(phone: string, text: string): Promise<void> {
    try {
      await this.whatsapp.sendText(phone, text);
    } catch (primaryErr) {
      this.logger.error(JSON.stringify({
        event:  'whatsapp_primary_send_failed',
        phone,
        length: text.length,
        error:  String(primaryErr),
      }));

      await new Promise((r) => setTimeout(r, this.retryDelayMs));
      try {
        await this.whatsapp.sendText(phone, text);
        this.logger.log(JSON.stringify({ event: 'whatsapp_send_recovered', phone }));
      } catch (retryErr) {
        this.logger.warn(JSON.stringify({
          event: 'whatsapp_send_failed_to_outbox',
          phone,
          error: String(retryErr),
        }));
        await this.outbox.enqueue(phone, text);
      }
    }
  }
}
