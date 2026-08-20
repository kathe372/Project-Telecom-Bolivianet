import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

/**
 * MEJORA-1A: evento de ejecución del agente por turno.
 * Persiste lo que antes solo vivía en logs (toolsCalled, latencia, sentimiento)
 * para poder calcular métricas de negocio: top intenciones, p50/p95, etc.
 */
@Entity('bot_events')
export class BotEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'phone_number', length: 20 })
  phoneNumber: string;

  @Column({ name: 'event_type', length: 30, default: 'agent_run' })
  eventType: string;

  /** Nombres de herramientas invocadas en el turno (JSON array). */
  @Column({ name: 'tools_called', type: 'jsonb', default: () => `'[]'` })
  toolsCalled: string[];

  @Column({ name: 'duration_ms', type: 'int', default: 0 })
  durationMs: number;

  @Column({ name: 'response_length', type: 'int', default: 0 })
  responseLength: number;

  @Column({ length: 20, nullable: true })
  sentiment: string | null;

  @Index('idx_bot_events_created_at')
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
