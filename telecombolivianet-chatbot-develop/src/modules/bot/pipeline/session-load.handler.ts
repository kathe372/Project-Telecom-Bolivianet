import { Injectable } from '@nestjs/common';
import { SessionService } from '../../session/session.service';
import { ConversationMemoryService } from '../../monitoring/conversation-memory.service';
import { MessageContext } from './message-context';
import { MessageHandler } from './message-handler';

@Injectable()
export class SessionLoadHandler implements MessageHandler {
  constructor(
    private readonly session: SessionService,
    private readonly memory:  ConversationMemoryService,
  ) {}

  async handle(ctx: MessageContext, next: () => Promise<void>): Promise<void> {
    // NO envolver next() en withLock: los handlers posteriores usan métodos de
    // SessionService que toman el mismo lock (addMessage, updateSession...) y
    // el lock no es reentrante — se produce un deadlock hasta agotar reintentos.
    // Cada operación de sesión ya es atómica por su propio lock granular.
    ctx.session = await this.session.getSession(ctx.phone);

    // MEJORA-1D: sesión recién nacida (TTL expiró) → recuperar el resumen de la
    // conversación anterior. Solo cuesta 1 query en el PRIMER mensaje de la sesión.
    // NOTA: updateSession (JS), no patchSession (Lua) — cjson convierte el
    // array vacío messages:[] en objeto {} y corrompe la sesión nueva.
    if (ctx.session.messages.length === 0 && !ctx.session.previousSummary) {
      const previous = await this.memory.loadReturningContext(ctx.phone);
      if (previous) {
        ctx.session = await this.session.updateSession(ctx.phone, {
          previousSummary:   previous.summary,
          previousSummaryAt: previous.summaryAt,
        });
      }
    }

    await next();
  }
}
