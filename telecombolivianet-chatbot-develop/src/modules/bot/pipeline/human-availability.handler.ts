import { Injectable, Logger } from '@nestjs/common';
import { BotConfigCacheService, BotScheduleConfig } from '../bot-config-cache.service';
import { MessageContext } from './message-context';
import { MessageHandler } from './message-handler';

// BUG (2026-08-02): antes se leía new Date().getHours()/getDay(), que refleja
// la zona horaria AMBIENTE del proceso (process.env.TZ del sistema operativo),
// no una zona horaria explícita. Hoy funciona en Railway porque alguien fijó
// TZ=America/La_Paz en las variables del servicio — pero es una dependencia
// invisible: una máquina de desarrollo, un runner de CI, o un futuro redeploy
// que no herede esa variable, evaluarían el horario comercial con hasta varias
// horas de corrimiento sin que nada lo avise. Se calcula ahora explícitamente
// en esta zona horaria, sin depender del entorno del proceso.
const BUSINESS_TIMEZONE = 'America/La_Paz';

const WEEKDAY_TO_CFG_INDEX: Record<string, number> = {
  Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
};

@Injectable()
export class HumanAvailabilityHandler implements MessageHandler {
  private readonly logger = new Logger(HumanAvailabilityHandler.name);

  constructor(private readonly botConfigCache: BotConfigCacheService) {}

  async handle(ctx: MessageContext, next: () => Promise<void>): Promise<void> {
    const cfg = await this.botConfigCache.getConfig();
    ctx.humanAvailable = this.isWithinSchedule(cfg.Horario);

    this.logger.debug(
      `HumanAvailability para ${ctx.phone}: ${ctx.humanAvailable ? 'DENTRO' : 'FUERA'} de ventana humana.`,
    );

    await next();
  }

  isWithinSchedule(horario: BotScheduleConfig, now: Date = new Date()): boolean {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone:  BUSINESS_TIMEZONE,
      weekday:   'short',
      hour:      '2-digit',
      minute:    '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);

    const get = (type: string) => parts.find((p) => p.type === type)!.value;

    const cfgIndex = WEEKDAY_TO_CFG_INDEX[get('weekday')];
    if (!horario.DiasActivos[cfgIndex]) return false;

    const [startH, startM] = horario.HoraInicio.split(':').map(Number);
    const [endH,   endM]   = horario.HoraFin.split(':').map(Number);
    const current          = Number(get('hour')) * 60 + Number(get('minute'));

    return current >= startH * 60 + startM && current < endH * 60 + endM;
  }
}
