import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BotEvent } from '../../database/entities/bot-event.entity';

export interface AgentRunEvent {
  phoneNumber: string;
  toolsCalled: string[];
  durationMs: number;
  responseLength: number;
  sentiment?: string | null;
}

/**
 * MEJORA-1A: persiste eventos agent_run en bot_events.
 * Fire-and-forget: registrar métricas NUNCA debe bloquear ni romper la
 * respuesta al cliente — los errores se loguean y se descartan.
 */
@Injectable()
export class BotEventRecorderService {
  private readonly logger = new Logger(BotEventRecorderService.name);

  constructor(
    @InjectRepository(BotEvent) private readonly repo: Repository<BotEvent>,
  ) {}

  recordAgentRun(event: AgentRunEvent): void {
    this.repo
      .save(this.repo.create({
        phoneNumber:    event.phoneNumber,
        eventType:      'agent_run',
        toolsCalled:    event.toolsCalled ?? [],
        durationMs:     Math.max(0, Math.round(event.durationMs)),
        responseLength: event.responseLength,
        sentiment:      event.sentiment ?? null,
      }))
      .catch((err: Error) =>
        this.logger.warn(`No se pudo registrar bot_event: ${err.message}`),
      );
  }
}
