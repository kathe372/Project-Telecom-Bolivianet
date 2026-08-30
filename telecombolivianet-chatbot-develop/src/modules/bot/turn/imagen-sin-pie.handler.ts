import { Injectable } from '@nestjs/common';
import { MessageHandler } from '../pipeline/message-handler';
import { MessageContext } from '../pipeline/message-context';
import { EscalationService } from './escalation.service';

/**
 * Una foto sin texto que la acompane no la entiende el agente: se escala a una
 * persona.
 *
 * E-05: extraido de processCoreLogic, que acumulaba 348 lineas y once decisiones
 * encadenadas.
 *
 * Depende de EscalationService, no del orquestador. Escalar era un metodo
 * publico DEL orquestador, asi que la primera decision que se sacaba a su clase
 * creaba una dependencia circular; sacar tambien la escalacion la deshace.
 */
@Injectable()
export class ImagenSinPieHandler implements MessageHandler {
  constructor(private readonly escalacion: EscalationService) {}

  async handle(ctx: MessageContext, next: () => Promise<void>): Promise<void> {
    const session = ctx.updatedSession!;

    if (ctx.type === 'image' && ctx.imageId && !ctx.imageCaption?.trim()) {
      await this.escalacion.trigger(session, !session.humanAvailable);
      return;   // atendido: no sigue la cadena
    }

    await next();
  }
}
