import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { WhatsappApiService } from './whatsapp-api.service';
import { OutboxRepositoryService } from './outbox-repository.service';


const MAX_ATTEMPTS = 5;

@Injectable()
export class WhatsappOutboxService {
  private readonly logger = new Logger(WhatsappOutboxService.name);
  private cronRunning = false;

  constructor(
    private readonly outboxRepo: OutboxRepositoryService,
    private readonly whatsapp:   WhatsappApiService,
  ) {}

  async enqueue(phone: string, text: string): Promise<void> {
    await this.outboxRepo.push(phone, text);
    this.logger.warn(JSON.stringify({ event: 'outbox_enqueued', phone, length: text.length }));
  }

  async tryDeliverPending(phone: string): Promise<void> {
    // R2: lock PRIMERO, luego leer la entrada DENTRO del lock. Si otro hilo ya
    // la entregó y removió, aquí la entrada será null → nada que reenviar.
    const acquired = await this.outboxRepo.markAsProcessing(phone);
    if (!acquired) return;

    const entry = await this.outboxRepo.get(phone);
    if (!entry) {
      await this.outboxRepo.revertToPending(phone); // liberar el lock, no hay nada
      return;
    }

    try {
      await this.whatsapp.sendText(phone, entry.text);
      await this.outboxRepo.remove(phone);
      this.logger.log(JSON.stringify({
        event: 'outbox_delivered_on_incoming', phone,
        attempts: entry.attempts, ageMs: Date.now() - entry.addedAt,
      }));
    } catch {
      await this.outboxRepo.revertToPending(phone);
    }
  }

  @Cron('*/2 * * * *')
  async retryOutbox(): Promise<void> {
    if (this.cronRunning) return;
    this.cronRunning = true;

    try {
      const phones = await this.outboxRepo.getAllPhones();
      if (phones.length === 0) return;

      this.logger.debug(`Outbox cron: ${phones.length} mensaje(s) pendiente(s)`);

      for (const phone of phones) {
        // R2: lock PRIMERO, luego leer la entrada DENTRO del lock (misma carrera
        // que tryDeliverPending: el webhook entrante puede competir con el cron).
        const acquired = await this.outboxRepo.markAsProcessing(phone);
        if (!acquired) continue;

        const entry = await this.outboxRepo.get(phone);
        if (!entry) {
          await this.outboxRepo.revertToPending(phone);
          continue;
        }

        if (entry.attempts >= MAX_ATTEMPTS) {
          this.logger.warn(JSON.stringify({
            event: 'outbox_discarded', phone,
            attempts: entry.attempts, ageMs: Date.now() - entry.addedAt,
            preview: entry.text.slice(0, 100),
          }));
          await this.outboxRepo.remove(phone);
          continue;
        }

        try {
          await this.whatsapp.sendText(phone, entry.text);
          await this.outboxRepo.remove(phone);
          this.logger.log(JSON.stringify({
            event: 'outbox_delivered_by_cron', phone,
            attempts: entry.attempts + 1, ageMs: Date.now() - entry.addedAt,
          }));
        } catch {
          await this.outboxRepo.revertToPending(phone);
          await this.outboxRepo.incrementAttempts(phone);
        }
      }
    } finally {
      this.cronRunning = false;
    }
  }
}
