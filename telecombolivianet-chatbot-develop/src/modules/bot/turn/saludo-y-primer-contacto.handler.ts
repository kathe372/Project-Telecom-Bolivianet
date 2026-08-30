import { Injectable } from '@nestjs/common';
import { MessageHandler } from '../pipeline/message-handler';
import { MessageContext } from '../pipeline/message-context';
import { MainMenuService } from '../main-menu.service';
import { FirstContactPolicy } from '../pipeline/first-contact.policy';

/**
 * Cuando mostrar el menu de bienvenida, y cuando ademas cortar el turno.
 *
 * Dos casos distintos que conviene no confundir:
 *
 *  - PRIMER CONTACTO: se muestra el menu y, si el mensaje NO traia nada
 *    accionable, ahi termina. Si traia GPS, una imagen o una consulta de
 *    verdad, el turno SIGUE — BUG-4: antes ese contenido se descartaba y el
 *    cliente tenia que repetirlo.
 *  - SALUDO SUELTO mas adelante: se vuelve a mostrar el menu y se corta. Antes
 *    esto solo pasaba en el primer contacto, y despues el modelo narraba las
 *    opciones en texto plano en vez de mandar los botones.
 *
 * E-05: extraido de processCoreLogic.
 */
@Injectable()
export class SaludoYPrimerContactoHandler implements MessageHandler {
  constructor(
    private readonly mainMenu: MainMenuService,
    private readonly firstContactPolicy: FirstContactPolicy,
  ) {}

  async handle(ctx: MessageContext, next: () => Promise<void>): Promise<void> {
    const session = ctx.updatedSession!;

    if (ctx.isFirstContact) {
      await this.mainMenu.sendWelcome(session);
      if (!this.firstContactPolicy.hasActionableContent(ctx)) return;
    } else if (this.firstContactPolicy.isBareGreeting(ctx)) {
      await this.mainMenu.sendWelcome(session);
      return;
    }

    await next();
  }
}
