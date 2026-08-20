import {
  Controller, Post, Body, Logger, Inject, UseGuards, BadRequestException,
} from '@nestjs/common';
import { InternalTokenGuard } from '../../common/guards/internal-token.guard';
import { validatePhone } from '../../common/validators/phone.validator';
import { ConfigService } from '@nestjs/config';
import { SessionService } from '../session/session.service';
import { WhatsappApiService } from '../whatsapp/whatsapp-api.service';
import { MessageFormatterService } from '../bot/message-formatter.service';
import { IClientRepository, CLIENT_REPOSITORY } from '../client/sistema-api.interfaces';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Conversation } from '../../database/entities/conversation.entity';
import { Message, MessageRole, MessageSource } from '../../database/entities/message.entity';


export enum BotEventType {
  INSTALLATION_CANCELLED = 'INSTALLATION_CANCELLED',
  INSTALLATION_CONFIRMATION = 'INSTALLATION_CONFIRMATION',
  CUSTOM_MESSAGE = 'CUSTOM_MESSAGE',
  BOT_RESUME = 'BOT_RESUME',
}

export interface NotifyClientDto {
  PhoneNumber: string;
  EventType: BotEventType;
  AgentName?: string;
  Metadata?: {
    Message?: string;
    Reason?: string;
    InstallationDate?: string;
    Nombre?: string;
    Hora?: string;
    Direccion?: string;
  };
}

@UseGuards(InternalTokenGuard)
@Controller('bot')
export class AdminNotifyController {
  private readonly logger = new Logger(AdminNotifyController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly session: SessionService,
    private readonly whatsapp: WhatsappApiService,
    private readonly formatter: MessageFormatterService,
    @Inject(CLIENT_REPOSITORY) private readonly clientRepo: IClientRepository,
    @InjectRepository(Conversation) private readonly convRepo: Repository<Conversation>,
    @InjectRepository(Message) private readonly msgRepo: Repository<Message>,
  ) {}

  @Post('notify-client')
  async notifyClient(
    @Body() dto: NotifyClientDto,
  ): Promise<{ ok: boolean }> {

    const { EventType, AgentName, Metadata } = dto;
    // D1 (2026-08-07): el backend llegó a mandar el número con prefijo "591",
    // que no es el formato con el que se indexan `conversations` ni las
    // sesiones de Redis. Resultado: se creaba una conversación DUPLICADA y el
    // updateSession escribía sobre una sesión huérfana (la real conservaba,
    // por ejemplo, el activeInstallationId de una instalación ya cancelada).
    // Se normaliza acá, en la frontera, para que el chatbot funcione reciba el
    // formato que reciba y esto no pueda volver a romperse desde el otro lado.
    const PhoneNumber = this.normalizePhone(dto.PhoneNumber);
    this.logger.log(`Notificación C# → Bot: ${EventType} para ${PhoneNumber}`);

    switch (EventType) {

      case BotEventType.INSTALLATION_CANCELLED: {
        const reason = Metadata?.Reason || 'motivo no especificado';
        const dateStr = Metadata?.InstallationDate ? ` del ${Metadata.InstallationDate}` : '';
        const msg =
          `⚠️ Tu instalación agendada${dateStr} fue cancelada por nuestro equipo.\n\n` +
          `*Motivo:* ${reason}\n\n` +
          `Disculpa los inconvenientes. ¿Deseas reagendar para otro horario disponible?`;

        await this.whatsapp.sendText(PhoneNumber, msg);
        await this.session.updateSession(PhoneNumber, { activeInstallationId: null });
        await this.persistAdminMessage(PhoneNumber, msg, AgentName);
        break;
      }

      case BotEventType.INSTALLATION_CONFIRMATION: {
        const nombre = Metadata?.Nombre ? ` ${Metadata.Nombre}` : '';
        const fecha  = Metadata?.InstallationDate ?? 'mañana';
        const hora   = Metadata?.Hora ? ` a las *${Metadata.Hora}*` : '';
        const dir    = Metadata?.Direccion ? `\n📍 ${Metadata.Direccion}` : '';
        const msg =
          `¡Hola${nombre}! 👋 Te recordamos tu instalación programada para ` +
          `*${fecha}*${hora}.${dir}\n\n¿Confirmas que estarás presente?`;

        try {
          // Los ids de botón vuelven por el webhook y el intent-mapper los
          // traduce (confirmar_instalacion / reagendar_si).
          await this.whatsapp.sendButtons(PhoneNumber, msg, [
            { id: 'confirmar_instalacion', title: '✅ Confirmo' },
            { id: 'reagendar_si',          title: '📅 Reagendar' },
          ]);
        } catch (err) {
          this.logger.warn(
            `sendButtons de confirmación falló para ${PhoneNumber}: ${(err as Error).message} — enviando texto plano`,
          );
          await this.whatsapp.sendText(
            PhoneNumber,
            `${msg}\n\nResponde *SI* para confirmar o *REAGENDAR* para elegir otro horario.`,
          );
        }
        await this.persistAdminMessage(PhoneNumber, msg, AgentName ?? 'Sistema');
        break;
      }

      case BotEventType.BOT_RESUME: {
        await this.session.deescalate(PhoneNumber);
        await this.convRepo.update(
          { phoneNumber: PhoneNumber },
          { isEscalated: false, agentName: null },
        );

        await this.whatsapp.sendText(PhoneNumber, this.formatter.botResumed());
        break;
      }

      case BotEventType.CUSTOM_MESSAGE: {
        if (!Metadata?.Message) break;

        const agentLabel = AgentName ? `*${AgentName}:* ` : '';
        await this.whatsapp.sendText(PhoneNumber, `${agentLabel}${Metadata.Message}`);
        await this.persistAdminMessage(PhoneNumber, Metadata.Message, AgentName);
        break;
      }

      default:
        this.logger.warn(`EventType desconocido: ${EventType}`);
    }

    return { ok: true };
  }

  /**
   * 2026-08-05: el backend llama esto apenas se guarda un cliente con el
   * teléfono cambiado (UpdateClientHandler) — solo resetea el timestamp de
   * verificación de la sesión de WhatsApp de ese número, para que
   * ClientIdentificationHandler lo re-consulte contra el backend en el
   * próximo mensaje en vez de esperar hasta identityReverifyMinutes (2h por
   * default). No toca clientId/clientName directo — la re-verificación real
   * ya la hace el handler con la misma lógica que el chequeo periódico.
   */
  @Post('invalidate-identity')
  async invalidateIdentity(
    @Body() dto: { Phone: string },
  ): Promise<{ ok: boolean }> {
    if (!dto?.Phone) return { ok: false };
    // D1: misma normalización — sin ella se parcheaba la clave de sesión
    // equivocada y la invalidación inmediata de identidad no hacía nada.
    const phone = this.normalizePhone(dto.Phone);
    await this.session.patchSession(phone, { identityVerifiedAt: null });
    this.logger.log(`Identidad invalidada por cambio de teléfono en el panel: ${phone}`);
    return { ok: true };
  }

  /** D1: teléfono al formato canónico del sistema (local de 8 dígitos). */
  private normalizePhone(raw: string): string {
    const resultado = validatePhone(raw);
    if (!resultado.valid) {
      throw new BadRequestException(`Teléfono inválido: ${resultado.error}`);
    }
    return resultado.normalized;
  }

  @Post('backfill-client-names')
  async backfillClientNames(): Promise<{ processed: number; updated: number; notFound: number }> {

    const conversations = await this.convRepo.find({
      where: { clientName: IsNull() },
      select: ['id', 'phoneNumber'],
    });

    let updated = 0;
    let notFound = 0;

    for (const conv of conversations) {
      try {
        const client = await this.clientRepo.getClientByPhone(conv.phoneNumber);
        if (client?.FullName) {
          await this.convRepo.update({ id: conv.id }, {
            clientName: client.FullName,
            clientId:   client.Id,
          });
          updated++;
        } else {
          notFound++;
        }
      } catch (err) {
        this.logger.warn(`backfill: error para ${conv.phoneNumber}: ${err?.message}`);
        notFound++;
      }
    }

    this.logger.log(`backfill-client-names: processed=${conversations.length} updated=${updated} notFound=${notFound}`);
    return { processed: conversations.length, updated, notFound };
  }

  private async persistAdminMessage(
    phone: string,
    content: string,
    agentName?: string,
  ): Promise<void> {
    try {
      let conv = await this.convRepo.findOne({ where: { phoneNumber: phone } });
      if (!conv) {
        conv = await this.convRepo.save(this.convRepo.create({ phoneNumber: phone }));
      }

      if (agentName) {
        await this.convRepo.update({ id: conv.id }, { agentName });
      }

      await this.msgRepo.save(
        this.msgRepo.create({
          conversationId: conv.id,
          role: MessageRole.ADMIN,
          content,
          source: MessageSource.ADMIN,
        }),
      );
    } catch (err) {
      this.logger.error(`Error persistiendo mensaje admin: ${err.message}`);
    }
  }
}
