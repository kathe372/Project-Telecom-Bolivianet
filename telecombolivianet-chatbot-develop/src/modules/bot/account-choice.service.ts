import { Injectable } from '@nestjs/common';
import { SessionData } from '../session/session.service';
import { InteractiveIdCodec } from './intents/interactive-id.codec';
import { MessageSenderService } from './pipeline/message-sender.service';

/**
 * 2026-08-05: cuando un teléfono tiene más de un cliente asociado (PhoneMain
 * no es único — ej. dos familiares con contratos separados que comparten el
 * mismo WhatsApp de contacto), ClientIdentificationHandler no elige uno solo:
 * guarda las opciones en session.ambiguousClients y este servicio le pregunta
 * al usuario con cuál continuar, con botones (mismo patrón que MainMenuService
 * y la selección de plan/horario — id embebido, sin estado extra en servidor).
 */
@Injectable()
export class AccountChoiceService {
  constructor(
    private readonly sender: MessageSenderService,
    private readonly codec: InteractiveIdCodec,
  ) {}

  async sendChoices(session: SessionData): Promise<void> {
    const opciones = session.ambiguousClients ?? [];
    if (opciones.length === 0) return;

    const rows = opciones.map(c => ({
      id:          this.codec.encodeAccount(c.clientId),
      title:       c.tbnCode,
      description: `${c.clientName} · ${c.planName}`,
    }));

    await this.sender.sendWithList(
      session,
      'Encontré más de un servicio registrado con este número. ¿Con cuál deseas continuar?',
      { buttonLabel: 'Elegir servicio', sections: [{ title: 'Tus servicios', rows }] },
    );
  }
}
