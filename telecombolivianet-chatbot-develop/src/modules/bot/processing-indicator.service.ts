import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsappApiService } from '../whatsapp/whatsapp-api.service';

/**
 * MEJORA-1B: señales de "estoy trabajando" durante llamadas largas al LLM.
 * 1. Dispara el indicador nativo "escribiendo…" (typing_indicator) al comenzar.
 * 2. Si la respuesta tarda más del umbral (default 8s), envía UN mensaje interino.
 *
 * El mensaje interino NO se persiste en la sesión ni en la BD a propósito:
 * es una señal de UX efímera, no contenido de la conversación — persistirlo
 * contaminaría el historial que se envía al LLM en el siguiente turno.
 */
@Injectable()
export class ProcessingIndicatorService {
  private readonly logger = new Logger(ProcessingIndicatorService.name);
  private readonly nudgeAfterMs: number;

  private static readonly NUDGE_TEXT =
    '⏳ Estoy revisando tu consulta, dame unos segundos por favor...';

  constructor(
    private readonly whatsapp: WhatsappApiService,
    config: ConfigService,
  ) {
    this.nudgeAfterMs = config.get<number>('bot.nudgeAfterMs') ?? 30_000;
  }

  /**
   * Inicia typing + programa el aviso de espera.
   * Devuelve un `stop()` que SIEMPRE debe llamarse al terminar (try/finally):
   * cancela el aviso pendiente y evita enviarlo después de la respuesta real.
   */
  begin(phone: string, messageId: string): () => void {
    this.whatsapp.markAsRead(messageId, true).catch((err: Error) =>
      this.logger.debug(`typing indicator falló (ignorado): ${err.message}`),
    );

    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      this.whatsapp.sendText(phone, ProcessingIndicatorService.NUDGE_TEXT).catch((err: Error) =>
        this.logger.debug(`nudge de espera falló (ignorado): ${err.message}`),
      );
    }, this.nudgeAfterMs);

    return () => {
      finished = true;
      clearTimeout(timer);
    };
  }
}
