import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { SessionService } from '../session/session.service';
import { SistemaApiService } from '../client/sistema-api.service';
import { Message } from '../../database/entities/message.entity';
import { Conversation } from '../../database/entities/conversation.entity';


export interface BillingDateContext {
  dayOfMonth: number;
  isBeforeDeadline: boolean;
  isDeadlineDay: boolean;
  isOverdueDay: boolean;
  isReminderDay: boolean;
  isAfterReminder: boolean;
  daysUntilDeadline: number;
  shouldShowOverdueWarning: boolean;
  botShouldSendReminder: false;
}

@Injectable()
export class BillingJobsCompatService {
  private readonly logger = new Logger(BillingJobsCompatService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly sistemaApi: SistemaApiService,
    private readonly sessionService: SessionService,
    @InjectRepository(Message)
    private readonly msgRepo: Repository<Message>,
    @InjectRepository(Conversation)
    private readonly convRepo: Repository<Conversation>,
  ) {}

  @Cron('0 */6 * * *', { name: 'jwt-renewal' })
  async renewJwtProactively(): Promise<void> {
    this.logger.log('Cron JWT: verificando y renovando token del sistema C#...');
    try {
      await this.sistemaApi.getActivePlans();
      this.logger.log('Cron JWT: token verificado correctamente ✔');
    } catch (err) {
      this.logger.error(`Cron JWT: error al renovar token — ${err.message}`);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { name: 'message-purge' })
  async purgeOldMessages(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    try {
      const result = await this.msgRepo.delete({
        createdAt: LessThan(cutoff),
      });
      if ((result.affected ?? 0) > 0) {
        this.logger.log(`Purga mensajes: ${result.affected} mensajes > 30 días eliminados`);
      }
    } catch (err) {
      this.logger.error(`Purga mensajes fallida: ${err.message}`);
    }
  }

  @Cron('0 2 * * *', { name: 'redis-session-sync' })
  async syncExpiredEscalations(): Promise<void> {
    try {
      const escalated = await this.convRepo.find({
        where: { isEscalated: true },
        select: ['id', 'phoneNumber', 'escalatedAt'],
      });

      let synced = 0;
      for (const conv of escalated) {
        const session = await this.sessionService.getSession(conv.phoneNumber);
        if (!session.isEscalated) {
          await this.convRepo.update(conv.id, {
            isEscalated: false,
            agentName: null,
          });
          synced++;
        }
      }

      if (synced > 0) {
        this.logger.log(`Sync sesiones: ${synced} conversaciones de-escaladas por TTL expirado`);
      }
    } catch (err) {
      this.logger.error(`Sync sesiones fallido: ${err.message}`);
    }
  }


  getBillingDateContext(date: Date = new Date()): BillingDateContext {
    const day = date.getDate();

    return {
      dayOfMonth: day,
      isBeforeDeadline: day >= 1 && day <= 5,
      isDeadlineDay: day === 5,
      isOverdueDay: day === 6,
      isReminderDay: day === 7,
      isAfterReminder: day > 7,
      daysUntilDeadline: 5 - day,
      shouldShowOverdueWarning: day >= 6,
      botShouldSendReminder: false,
    };
  }

  getInvoiceAvailabilityNote(date: Date = new Date()): string | null {
    const day = date.getDate();
    const month = date.getMonth();

    if (day === 1) {
      return `ℹ️ Hoy se generan las facturas del mes. Si tu factura aún no aparece, espera unos minutos.`;
    }

    if (day >= 28) {
      const nextMonth = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][(month + 1) % 12];
      return `ℹ️ La factura de *${nextMonth}* se generará el día 1 del mes próximo.`;
    }

    return null;
  }

  getEffectiveSlaHours(basePriority: 'Alta' | 'Media' | 'Baja', hasOverdueInvoices: boolean): number {
    const base = basePriority === 'Alta' ? 4 : basePriority === 'Media' ? 8 : 24;
    return hasOverdueInvoices && basePriority !== 'Alta' ? Math.floor(base / 2) : base;
  }
}
