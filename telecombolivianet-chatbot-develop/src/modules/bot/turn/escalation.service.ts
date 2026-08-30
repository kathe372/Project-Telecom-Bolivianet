import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SessionData, SessionService } from '../../session/session.service';
import { WhatsappApiService } from '../../whatsapp/whatsapp-api.service';
import { AdminSignalrNotifierService } from '../../notifications/admin-signalr-notifier.service';
import { BotConfigCacheService } from '../bot-config-cache.service';
import { AgentService } from '../agent.service';
import { Conversation } from '../../../database/entities/conversation.entity';

/**
 * Pasar la conversacion a una persona.
 *
 * E-05 — Era un metodo publico del orquestador, y eso obligaba a que cualquier
 * pieza que necesitara escalar dependiera del orquestador ENTERO: una
 * dependencia circular en cuanto se saco la primera decision a su propia clase.
 *
 * Aqui vive con sus cinco colaboradores y nada mas.
 */
@Injectable()
export class EscalationService {
  private readonly logger = new Logger(EscalationService.name);

  constructor(
    private readonly botConfigCache: BotConfigCacheService,
    private readonly whatsapp:       WhatsappApiService,
    private readonly adminNotifier:  AdminSignalrNotifierService,
    private readonly session:        SessionService,
    private readonly agent:          AgentService,
    @InjectRepository(Conversation) private readonly convRepo: Repository<Conversation>,
  ) {}

  /**
   * @param deferred   Fuera del horario de atencion: se avisa y se deja en cola.
   * @param notifyUser Falso cuando el turno ya respondio otra cosa y un segundo
   *                   mensaje sonaria a duplicado.
   */
  async trigger(session: SessionData, deferred = false, notifyUser = true): Promise<void> {
    const cfg = await this.botConfigCache.getConfig();

    if (deferred) {
      if (notifyUser) {
        await this.whatsapp.sendText(session.phoneNumber, cfg.Horario.MensajeFueraHorario);
      }
      this.logger.log(JSON.stringify({
        event: 'escalation_deferred', phone: session.phoneNumber,
        clientName: session.clientName,
      }));
    } else {
      if (notifyUser) {
        await this.whatsapp.sendText(session.phoneNumber, cfg.Mensajes.EscaladoAgente);
      }
      await this.adminNotifier.notifyEscalation({
        phoneNumber: session.phoneNumber,
        clientName:  session.clientName ?? undefined,
        reason:      'Escalado via agente IA',
      });
    }

    await this.session.escalate(session.phoneNumber);

    // El resumen es un extra: si Gemini falla, la escalacion se hace igual. Sin
    // este try, un 429 dejaria la conversacion sin escalar y al cliente
    // esperando a una persona que nunca fue avisada.
    let summary = '';
    try {
      const history = await this.session.getGeminiHistory(session.phoneNumber);
      summary = await this.agent.summarizeConversation(history);
    } catch (err) {
      this.logger.warn(`No se pudo generar resumen de escalación: ${(err as Error).message}`);
    }

    await this.convRepo.update(
      { phoneNumber: session.phoneNumber },
      { isEscalated: true, escalatedAt: new Date(), ...(summary ? { summary } : {}) },
    );

    this.logger.log(JSON.stringify({
      event: 'escalation_triggered', phone: session.phoneNumber,
      clientName: session.clientName, deferred, hasSummary: !!summary,
    }));
  }
}
