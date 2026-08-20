import { Injectable } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, DataSource } from 'typeorm';
import { Conversation } from '../../database/entities/conversation.entity';
import { Message, MessageRole } from '../../database/entities/message.entity';

export interface BotMetricsSummary {
  windowDays: number;
  conversations: { active: number; escalated: number; escalationRate: number; deflectionRate: number };
  messages: { user: number; bot: number; human: number };
  topTools: Array<{ tool: string; count: number }>;
  latency: { p50Ms: number | null; p95Ms: number | null; samples: number };
}

/**
 * MEJORA-1A: KPIs de negocio del bot. Solo LECTURA sobre datos ya persistidos
 * (conversations, messages) + la tabla bot_events (intenciones y latencia).
 * El CSAT agregado vive en el backend C# (SupportTickets.RootCause) y se
 * consulta por su propia API — no desde aquí.
 */
@Injectable()
export class BotMetricsService {

  constructor(
    @InjectRepository(Conversation) private readonly convRepo: Repository<Conversation>,
    @InjectRepository(Message)      private readonly msgRepo:  Repository<Message>,
    @InjectDataSource()             private readonly dataSource: DataSource,
  ) {}

  async getSummary(windowDays = 30): Promise<BotMetricsSummary> {
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const [active, escalated, msgRows, toolRows, latRows] = await Promise.all([
      this.convRepo.count({ where: { updatedAt: MoreThanOrEqual(since) } }),
      this.convRepo.count({ where: { updatedAt: MoreThanOrEqual(since), isEscalated: true } }),
      this.msgRepo.createQueryBuilder('m')
        .select('m.role', 'role').addSelect('m.source', 'source').addSelect('COUNT(*)', 'count')
        .where('m.createdAt >= :since', { since })
        .groupBy('m.role').addGroupBy('m.source')
        .getRawMany<{ role: string; source: string | null; count: string }>(),
      this.dataSource.query(
        `SELECT tool, COUNT(*)::int AS count
         FROM bot_events, jsonb_array_elements_text(tools_called) AS tool
         WHERE created_at >= $1
         GROUP BY tool ORDER BY count DESC LIMIT 10`, [since]),
      this.dataSource.query(
        `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms) AS p50,
                percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95,
                COUNT(*)::int AS samples
         FROM bot_events WHERE created_at >= $1 AND event_type = 'agent_run'`, [since]),
    ]);

    const escalationRate = active > 0 ? escalated / active : 0;
    const lat = latRows[0] ?? {};

    return {
      windowDays,
      conversations: {
        active, escalated,
        escalationRate: round2(escalationRate),
        deflectionRate: round2(1 - escalationRate),
      },
      messages: {
        user:  this.sumBy(msgRows, (r) => r.role === MessageRole.USER),
        bot:   this.sumBy(msgRows, (r) => r.role === MessageRole.BOT),
        human: this.sumBy(msgRows, (r) => r.role === MessageRole.ADMIN),
      },
      topTools: toolRows,
      latency: {
        p50Ms:   lat.p50 != null ? Math.round(Number(lat.p50)) : null,
        p95Ms:   lat.p95 != null ? Math.round(Number(lat.p95)) : null,
        samples: lat.samples ?? 0,
      },
    };
  }

  private sumBy(rows: Array<{ role: string; count: string }>, pred: (r: { role: string }) => boolean): number {
    return rows.filter(pred).reduce((s, r) => s + Number(r.count), 0);
  }
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
