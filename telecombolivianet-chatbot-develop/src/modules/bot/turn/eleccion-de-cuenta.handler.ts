import { Injectable } from '@nestjs/common';
import { MessageHandler } from '../pipeline/message-handler';
import { MessageContext } from '../pipeline/message-context';
import { AccountChoiceService } from '../account-choice.service';

/**
 * El telefono tiene mas de un cliente asociado y el turno anterior no resolvio
 * cual: se vuelve a mostrar la lista antes que nada.
 *
 * 2026-08-05 — Va ANTES del menu de bienvenida a proposito: con la identidad sin
 * resolver, ese menu saludaria como si fuera un prospecto.
 *
 * E-05: extraido de processCoreLogic.
 */
@Injectable()
export class EleccionDeCuentaPendienteHandler implements MessageHandler {
  constructor(private readonly accountChoice: AccountChoiceService) {}

  async handle(ctx: MessageContext, next: () => Promise<void>): Promise<void> {
    const session = ctx.updatedSession!;

    if (session.ambiguousClients && session.ambiguousClients.length > 0) {
      await this.accountChoice.sendChoices(session);
      return;
    }

    await next();
  }
}
