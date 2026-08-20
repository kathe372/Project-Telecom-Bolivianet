import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IClientRepository, CLIENT_REPOSITORY,
  IPaymentRepository, PAYMENT_REPOSITORY,
} from '../../client/sistema-api.interfaces';
import { WhatsappApiService } from '../../whatsapp/whatsapp-api.service';
import { MediaStorageService } from '../../media/media-storage.service';
import { MessageFormatterService } from '../message-formatter.service';
import { SessionData, SessionService } from '../../session/session.service';
import { AgentTool } from './agent-tool.interface';
import { totalOutstanding } from '../domain/invoice-debt';

@Injectable()
export class SendPaymentQrTool implements AgentTool {
  private readonly logger = new Logger(SendPaymentQrTool.name);
  constructor(
    private readonly config:                                  ConfigService,
    @Inject(CLIENT_REPOSITORY)  private readonly clientRepo:  IClientRepository,
    @Inject(PAYMENT_REPOSITORY) private readonly paymentRepo: IPaymentRepository,
    private readonly whatsapp:       WhatsappApiService,
    private readonly mediaStorage:   MediaStorageService,
    private readonly formatter:      MessageFormatterService,
    private readonly sessionService: SessionService,
  ) {}

  getName(): string { return 'send_payment_qr'; }
  requiresIdentification(): boolean { return true; }
  isMutating(): boolean { return true; }

  getDeclaration(): object {
    return {
      name: this.getName(),
      description: 'Envía el código QR de pago al cliente. Usar cuando quiera pagar o pida el código QR.',
      parameters: { type: 'OBJECT', properties: {}, required: [] },
    };
  }

  async execute(_args: Record<string, unknown>, session: SessionData): Promise<unknown> {
    // BUG-03: dedup de envío. Si ya se envió el QR a este teléfono hace <45s
    // (mensajes fragmentados que generan turnos múltiples), no reenviar.
    if (!await this.sessionService.claimOnce(`qr:${session.phoneNumber}`, 45)) {
      // PASO 3: deduplicado = no hice nada — el LLM sigue libre de responder
      // a cualquier otra cosa que el cliente haya preguntado en el mismo turno.
      return { sent: false, deduped: true, _noOp: true };
    }

    let freshDebt = 0;
    try {
      const pending = await this.clientRepo.getPendingInvoices(session.clientId!);
      // PASO 1 (2026-08): antes sumaba inv.Amount (bruto) — si alguna factura
      // estaba ParcialmentePagada, esto sobreestimaba el saldo real, causando
      // que el monto del QR no coincidiera con el que ya mostró get_client_debt.
      freshDebt = totalOutstanding(pending);
    } catch (err: any) {
      this.logger.warn(`No se pudo verificar deuda, usando valor de sesión: ${err.message}`);
      freshDebt = session.totalDebt;
    }

    if (freshDebt <= 0) {
      const nombre = session.clientName ? ` *${session.clientName}*` : '';
      await this.whatsapp.sendText(
        session.phoneNumber,
        `✅ Hola${nombre}, en este momento *no tienes deuda pendiente* con Telecom Bolivianet. ` +
        `Tu cuenta está al día. 🎉\n\n` +
        `Si crees que hay un error o tienes alguna consulta, comunícate con nuestro equipo de atención.`,
      );
      // PASO 3: ya se envió el texto de "estás al día" directamente por WhatsApp,
      // pero eso no es motivo para apagar el resto del turno si el cliente
      // preguntó algo más en el mismo mensaje.
      return { sent: false, noDebt: true, _noOp: true };
    }

    const storagePublicUrl = this.config.get<string>('storage.publicUrl') || '';
    if (!storagePublicUrl) {
      this.logger.warn('STORAGE_PUBLIC_URL no configurada: degradando a instrucciones de pago por texto');
      return this.sendTextualPaymentInstructions(session, freshDebt);
    }

    try {
      const qrBuffer = await this.paymentRepo.getCompanyQrBuffer();
      const imageUrl = await this.mediaStorage.saveMedia(
        qrBuffer, 'image', `qr_${session.tbnCode || session.clientId}`,
      );

      const caption =
        `📋 *Código QR de pago — TelecomBoliviaNet*\n\n` +
        `Tu saldo pendiente es: *Bs. ${freshDebt.toFixed(2)}*\n\n` +
        `Escanea este QR con tu aplicación bancaria e ingresa el monto correspondiente.\n\n` +
        `✅ Una vez realizado el pago, nuestro equipo lo verificará y actualizará tu cuenta.`;

      await this.whatsapp.sendImage(session.phoneNumber, imageUrl, caption);

      // PASO 3: acá sí se entregó contenido directo (la imagen) — el turno
      // debe seguir suprimido para no duplicar con texto redactado por el LLM.
      return {
        sent:             true,
        totalDebt:        freshDebt,
        clientName:       session.clientName,
        message:          'Imagen QR enviada con instrucciones de pago.',
        _localUrl:        imageUrl,
        _mediaDelivered:  true,
      };
    } catch (err: any) {
      if (err.response?.status === 404) {
        return {
          sent:   false,
          reason:
            'El código QR de pago aún no está configurado en el sistema. ' +
            'Comunícate con atención al cliente para que te lo proporcionen.',
        };
      }
      // BUG-6: si la imagen no se pudo entregar (túnel caído, storage inaccesible),
      // el cliente igual recibe cómo pagar en texto en vez de un rebote genérico.
      this.logger.error(`SendPaymentQrTool error: ${err.message} — degradando a texto`);
      return this.sendTextualPaymentInstructions(session, freshDebt);
    }
  }

  private async sendTextualPaymentInstructions(
    session: SessionData, totalDebt: number,
  ): Promise<Record<string, unknown>> {
    try {
      await this.whatsapp.sendText(
        session.phoneNumber,
        this.formatter.qrInstruction(
          session.clientName ?? 'Cliente', session.tbnCode ?? 'N/D', totalDebt,
        ),
      );
      // PASO 3: mismo razonamiento — ya se entregó el contenido, esta vez por texto.
      return {
        sent:            true,
        qrImage:         false,
        totalDebt,
        message:         'Instrucciones de pago enviadas por texto (imagen QR no disponible).',
        _mediaDelivered: true,
      };
    } catch (err: any) {
      this.logger.error(`Fallback textual de pago falló: ${err.message}`);
      return { sent: false, error: `No se pudo enviar la información de pago: ${err.message}` };
    }
  }
}
