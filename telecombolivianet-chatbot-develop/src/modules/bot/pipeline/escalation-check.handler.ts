import { Injectable, Logger } from '@nestjs/common';
import { SessionService } from '../../session/session.service';
import { MessageSource } from '../../../database/entities/message.entity';
import { MessagePersistenceService } from './message-persistence.service';
import { MessageContext } from './message-context';
import { MessageHandler } from './message-handler';
import { MessageSenderService } from './message-sender.service';

/** Cada cuánto, como máximo, se le repite el acuse al cliente escalado. */
const ACUSE_TTL_SEGUNDOS = 30 * 60;

const ACUSE =
  'Tu consulta ya está con un agente de nuestro equipo. Te van a responder por acá mismo. 🙏';

@Injectable()
export class EscalationCheckHandler implements MessageHandler {
  private readonly logger = new Logger(EscalationCheckHandler.name);

  constructor(
    private readonly session:     SessionService,
    private readonly persistence: MessagePersistenceService,
    private readonly sender:      MessageSenderService,
  ) {}

  async handle(ctx: MessageContext, next: () => Promise<void>): Promise<void> {
    if (!ctx.session?.isEscalated) {
      await next();
      return;
    }

    await this.persistence.persistMessage(
      ctx.session, 'user', ctx.userContent!,
      MessageSource.ADMIN, undefined,
      ctx.incomingMediaUrl, ctx.incomingMediaType,
    );
    // 2026-08-07: acá el bot quedaba en silencio ABSOLUTO. Medido en una prueba
    // real: el cliente escribió, no recibió nada, volvió a escribir, tampoco.
    // Y en producción la espera puede llegar a 24 h — el histórico tiene 22
    // escalaciones contra 3 respuestas humanas en toda la vida del sistema.
    //
    // El bot NO retoma la conversación (hay consultas que sólo un agente puede
    // resolver, y pisarlo sería peor). Pero callar no es una decisión, es una
    // omisión: el cliente ni siquiera sabe si su mensaje llegó.
    //
    // Se acusa una vez cada media hora como mucho, para no volverse ruido en
    // una ráfaga de mensajes.
    const primeraVez = await this.session.claimOnce(
      `escalado-acuse:${ctx.phone}`, ACUSE_TTL_SEGUNDOS,
    );
    if (primeraVez) {
      try {
        await this.sender.send(ctx.session, ACUSE);
      } catch (err: unknown) {
        this.logger.warn(
          `No se pudo enviar el acuse de escalación a ${ctx.phone}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.debug(`Conversación ${ctx.phone} escalada. Bot silenciado (acuse: ${primeraVez}).`);
  }
}
