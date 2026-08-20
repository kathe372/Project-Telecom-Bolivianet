import { Injectable } from '@nestjs/common';
import { SessionData } from '../../session/session.service';
import { IPromptSection } from './prompt-section.interface';

const INACTIVE_STATUSES = ['Suspendido', 'Cancelado', 'DadoDeBaja'];

@Injectable()
export class SuspensionCheckSection implements IPromptSection {
  applies(session: SessionData): boolean {
    return session.clientId !== null &&
      INACTIVE_STATUSES.includes(session.clientStatus ?? '');
  }

  render(session: SessionData): string {
    if (session.clientStatus === 'Suspendido') {
      return `REGLA CRÍTICA — SERVICIO SUSPENDIDO POR DEUDA:
El cliente tiene el servicio SUSPENDIDO. Sigue este flujo SIEMPRE:
1. Informa que el servicio está suspendido por falta de pago
2. NO des pasos de diagnóstico técnico — la causa no es técnica
3. Llama get_client_debt para mostrar el detalle de la deuda pendiente
4. Ofrece send_payment_qr para enviar el código de pago
5. Si el cliente insiste en soporte técnico, explica que primero debe regularizar su cuenta
6. Excepción: si el cliente afirma haber pagado ya pero el sistema no lo refleja,
   escala a agente humano para verificación manual`;
    }

    return `REGLA CRÍTICA — SERVICIO CANCELADO O DADO DE BAJA:
El cliente tiene el servicio en estado "${session.clientStatus}".
No crear tickets de soporte técnico. No dar pasos de diagnóstico.
Informar que su servicio está dado de baja y que debe contactar a administración
para reactivación. Ofrecer escalada a agente humano.`;
  }
}
