import { BotMetricsService } from './bot-metrics.service';
import { MessageRole } from '../../database/entities/message.entity';

function make(msgRows: any[], toolRows: any[], latRows: any[], counts: number[]) {
  const convRepo = { count: jest.fn() };
  counts.forEach((c) => convRepo.count.mockResolvedValueOnce(c));

  const qb = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(msgRows),
  };
  const msgRepo = { createQueryBuilder: jest.fn(() => qb) };
  const dataSource = { query: jest.fn().mockResolvedValueOnce(toolRows).mockResolvedValueOnce(latRows) };

  return {
    svc: new BotMetricsService(convRepo as any, msgRepo as any, dataSource as any),
    convRepo, dataSource,
  };
}

const MSG_ROWS = [
  { role: MessageRole.USER,  source: null, count: '30' },
  { role: MessageRole.BOT,   source: null, count: '25' },
  { role: MessageRole.ADMIN, source: null, count: '5'  },
];

describe('BotMetricsService.getSummary', () => {
  it('calcula tasa de escalación y deflexión', async () => {
    const { svc } = make(MSG_ROWS, [{ tool: 'get_client_debt', count: 5 }], [{ p50: 1200, p95: 3400, samples: 42 }], [10, 2]);

    const s = await svc.getSummary(30);

    expect(s.windowDays).toBe(30);
    expect(s.conversations).toEqual({ active: 10, escalated: 2, escalationRate: 0.2, deflectionRate: 0.8 });
  });

  it('suma mensajes por rol (user/bot/human)', async () => {
    const { svc } = make(MSG_ROWS, [], [{}], [10, 2]);

    const s = await svc.getSummary();

    expect(s.messages).toEqual({ user: 30, bot: 25, human: 5 });
  });

  it('devuelve topTools tal cual y redondea la latencia', async () => {
    const tools = [{ tool: 'get_client_debt', count: 5 }, { tool: 'send_payment_qr', count: 3 }];
    const { svc } = make(MSG_ROWS, tools, [{ p50: 1199.6, p95: 3400.4, samples: 42 }], [10, 2]);

    const s = await svc.getSummary();

    expect(s.topTools).toBe(tools);
    expect(s.latency).toEqual({ p50Ms: 1200, p95Ms: 3400, samples: 42 });
  });

  it('sin conversaciones activas → escalación 0 y deflexión 1', async () => {
    const { svc } = make([], [], [{}], [0, 0]);

    const s = await svc.getSummary();

    expect(s.conversations.escalationRate).toBe(0);
    expect(s.conversations.deflectionRate).toBe(1);
  });

  it('latencia sin muestras → p50/p95 null y samples 0', async () => {
    const { svc } = make([], [], [{ p50: null, p95: null, samples: 0 }], [1, 0]);

    const s = await svc.getSummary();

    expect(s.latency).toEqual({ p50Ms: null, p95Ms: null, samples: 0 });
  });

  it('usa ventana de 30 días por defecto en el filtro de fecha', async () => {
    const { svc, convRepo } = make([], [], [{}], [1, 0]);

    await svc.getSummary();

    const whereArg = convRepo.count.mock.calls[0][0].where.updatedAt;
    expect(whereArg).toBeDefined(); // MoreThanOrEqual(since)
  });
});
