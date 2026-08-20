import { HumanAvailabilityHandler } from './human-availability.handler';
import { MessageContext } from './message-context';
import { buildBotConfig } from '../../../test/factories/bot-config.factory';
import type { BotScheduleConfig } from '../bot-config-cache.service';


const makeCtx = (): MessageContext =>
  ({
    phone:          '59171435981',
    messageId:      'MSG-001',
    type:           'text',
    humanAvailable: false,
  } as MessageContext);

const makeBotConfigCache = (horario: Partial<BotScheduleConfig> = {}) => ({
  getConfig: jest.fn().mockResolvedValue(
    buildBotConfig({
      Horario: {
        HoraInicio:          '08:00',
        HoraFin:             '18:00',
        DiasActivos:         [true, true, true, true, true, false, false],
        MensajeFueraHorario: 'Fuera de horario.',
        ...horario,
      },
    }),
  ),
});

// Bolivia es UTC-4 todo el año (sin horario de verano) — estos instantes están
// escritos en UTC explícito ('...Z') para que el test sea determinístico sin
// importar en qué zona horaria corra la máquina/CI (BUG corregido 2026-08-02:
// el handler antes dependía de la zona horaria AMBIENTE del proceso). La hora
// boliviana real de cada caso está anotada al lado.
describe('HumanAvailabilityHandler', () => {
  let handler: HumanAvailabilityHandler;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });


  it('SIEMPRE llama next() dentro del horario', async () => {
    jest.setSystemTime(new Date('2026-06-15T14:00:00Z')); // Lun 10:00 Bolivia
    handler = new HumanAvailabilityHandler(makeBotConfigCache() as any);
    const ctx  = makeCtx();
    const next = jest.fn().mockResolvedValue(undefined);

    await handler.handle(ctx, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('SIEMPRE llama next() fuera del horario — bot nunca se detiene', async () => {
    jest.setSystemTime(new Date('2026-06-20T06:00:00Z')); // Sáb 02:00 Bolivia
    handler = new HumanAvailabilityHandler(makeBotConfigCache() as any);
    const ctx  = makeCtx();
    const next = jest.fn().mockResolvedValue(undefined);

    await handler.handle(ctx, next);

    expect(next).toHaveBeenCalledTimes(1);
  });


  it('fija humanAvailable=true el lunes a las 09:00 Bolivia (dentro del horario)', async () => {
    jest.setSystemTime(new Date('2026-06-15T13:00:00Z')); // Lun 09:00 Bolivia
    handler = new HumanAvailabilityHandler(makeBotConfigCache() as any);
    const ctx  = makeCtx();
    const next = jest.fn().mockResolvedValue(undefined);

    await handler.handle(ctx, next);

    expect(ctx.humanAvailable).toBe(true);
  });

  it('fija humanAvailable=true al límite de apertura (08:00 Bolivia exacto)', async () => {
    jest.setSystemTime(new Date('2026-06-15T12:00:00Z')); // Lun 08:00 Bolivia
    handler = new HumanAvailabilityHandler(makeBotConfigCache() as any);
    const ctx  = makeCtx();
    const next = jest.fn().mockResolvedValue(undefined);

    await handler.handle(ctx, next);

    expect(ctx.humanAvailable).toBe(true);
  });

  it('fija humanAvailable=true el viernes a las 17:59 Bolivia (último minuto hábil)', async () => {
    jest.setSystemTime(new Date('2026-06-19T21:59:00Z')); // Vie 17:59 Bolivia
    handler = new HumanAvailabilityHandler(makeBotConfigCache() as any);
    const ctx  = makeCtx();
    const next = jest.fn().mockResolvedValue(undefined);

    await handler.handle(ctx, next);

    expect(ctx.humanAvailable).toBe(true);
  });


  it('fija humanAvailable=false a las 02:00 Bolivia aunque sea día hábil', async () => {
    jest.setSystemTime(new Date('2026-06-15T06:00:00Z')); // Lun 02:00 Bolivia
    handler = new HumanAvailabilityHandler(makeBotConfigCache() as any);
    const ctx  = makeCtx();
    const next = jest.fn().mockResolvedValue(undefined);

    await handler.handle(ctx, next);

    expect(ctx.humanAvailable).toBe(false);
  });

  it('fija humanAvailable=false exactamente a las 18:00 Bolivia (hora de cierre, exclusivo)', async () => {
    jest.setSystemTime(new Date('2026-06-15T22:00:00Z')); // Lun 18:00 Bolivia
    handler = new HumanAvailabilityHandler(makeBotConfigCache() as any);
    const ctx  = makeCtx();
    const next = jest.fn().mockResolvedValue(undefined);

    await handler.handle(ctx, next);

    expect(ctx.humanAvailable).toBe(false);
  });

  it('fija humanAvailable=false el sábado (índice 5 — día inactivo)', async () => {
    jest.setSystemTime(new Date('2026-06-20T14:00:00Z')); // Sáb 10:00 Bolivia
    handler = new HumanAvailabilityHandler(makeBotConfigCache() as any);
    const ctx  = makeCtx();
    const next = jest.fn().mockResolvedValue(undefined);

    await handler.handle(ctx, next);

    expect(ctx.humanAvailable).toBe(false);
  });

  it('fija humanAvailable=false el domingo', async () => {
    jest.setSystemTime(new Date('2026-06-21T16:00:00Z')); // Dom 12:00 Bolivia
    handler = new HumanAvailabilityHandler(makeBotConfigCache() as any);
    const ctx  = makeCtx();
    const next = jest.fn().mockResolvedValue(undefined);

    await handler.handle(ctx, next);

    expect(ctx.humanAvailable).toBe(false);
  });


  it('fija humanAvailable=true si todos los días están activos (24/7 humano)', async () => {
    jest.setSystemTime(new Date('2026-06-21T07:00:00Z')); // Dom 03:00 Bolivia
    const cache = makeBotConfigCache({
      DiasActivos: [true, true, true, true, true, true, true],
      HoraInicio:  '00:00',
      HoraFin:     '23:59',
    });
    handler = new HumanAvailabilityHandler(cache as any);
    const ctx  = makeCtx();
    const next = jest.fn().mockResolvedValue(undefined);

    await handler.handle(ctx, next);

    expect(ctx.humanAvailable).toBe(true);
  });


  it('isWithinSchedule devuelve false si el día no está en DiasActivos', () => {
    handler = new HumanAvailabilityHandler(makeBotConfigCache() as any);
    const now = new Date('2026-06-20T14:00:00Z'); // Sáb 10:00 Bolivia

    const result = handler.isWithinSchedule({
      HoraInicio:          '08:00',
      HoraFin:             '18:00',
      DiasActivos:         [true, true, true, true, true, false, false],
      MensajeFueraHorario: '',
    }, now);

    expect(result).toBe(false);
  });

  it('isWithinSchedule devuelve false si la hora es antes del inicio', () => {
    handler = new HumanAvailabilityHandler(makeBotConfigCache() as any);
    const now = new Date('2026-06-15T11:59:00Z'); // Lun 07:59 Bolivia

    const result = handler.isWithinSchedule({
      HoraInicio:          '08:00',
      HoraFin:             '18:00',
      DiasActivos:         [true, true, true, true, true, false, false],
      MensajeFueraHorario: '',
    }, now);

    expect(result).toBe(false);
  });

  // BUG (2026-08-02): antes de este fix, este caso habría fallado si el
  // proceso corriera sin TZ=America/La_Paz (p.ej. una máquina de desarrollo
  // en UTC) — 14:00 UTC se habría leído como 14:00 local en vez de 10:00
  // Bolivia. Ahora es correcto sin importar la zona horaria del proceso.
  it('BUG FIX: el cálculo no depende de la zona horaria ambiente del proceso', () => {
    handler = new HumanAvailabilityHandler(makeBotConfigCache() as any);
    const now = new Date('2026-06-15T14:00:00Z'); // Lun 10:00 Bolivia (14:00 UTC)

    const result = handler.isWithinSchedule({
      HoraInicio:          '08:00',
      HoraFin:             '18:00',
      DiasActivos:         [true, true, true, true, true, false, false],
      MensajeFueraHorario: '',
    }, now);

    expect(result).toBe(true);
  });
});
