import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SessionService, SessionData } from './session.service';


const store = new Map<string, string>();

function applyStoreImpl() {
  redisMock.get.mockImplementation((key: string) =>
    Promise.resolve(store.get(key) ?? null));
  redisMock.setex.mockImplementation((key: string, _ttl: number, value: string) => {
    store.set(key, value);
    return Promise.resolve('OK');
  });
  redisMock.del.mockImplementation((key: string) => {
    store.delete(key);
    return Promise.resolve(1);
  });
  redisMock.eval.mockImplementation(
    (script: string, _numKeys: number, key: string, ...args: string[]) => {
      if (script.includes('NX')) {
        if (store.has(key)) return Promise.resolve(null);
        store.set(key, args[0]);
        return Promise.resolve('OK');
      }
      if (script.includes('cjson')) {
        const raw  = store.get(key) ?? args[1];
        const sess = JSON.parse(raw);
        const patch = JSON.parse(args[0]);
        Object.assign(sess, patch);
        store.set(key, JSON.stringify(sess));
        return Promise.resolve('OK');
      }
      if (store.get(key) === args[0]) {
        store.delete(key);
        return Promise.resolve(1);
      }
      return Promise.resolve(0);
    });
  redisMock.keys.mockImplementation(() => Promise.resolve([]));
  redisMock.ttl.mockImplementation(() => Promise.resolve(1800));
  redisMock.set.mockImplementation((key: string, value: string, ...args: string[]) => {
    if (args.includes('NX') && store.has(key)) return Promise.resolve(null);
    store.set(key, value);
    return Promise.resolve('OK');
  });
}

const redisMock = {
  get:        jest.fn(),
  set:        jest.fn(),
  setex:      jest.fn(),
  del:        jest.fn(),
  eval:       jest.fn(),
  keys:       jest.fn(),
  ttl:        jest.fn(),
  on:         jest.fn(),
  disconnect: jest.fn(),
};

applyStoreImpl();

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => redisMock),
}));

const CONFIG_MAP: Record<string, unknown> = {
  'redis.host':     'localhost',
  'redis.port':     6379,
  'redis.password': undefined,
  'redis.db':       0,
  'redis.sessionTtl': 86400,
  'rag.contextMessages': 5,
};

const configMock = {
  get: jest.fn((key: string) => CONFIG_MAP[key]),
};

describe('SessionService', () => {
  let service: SessionService;
  const PHONE = '59170000001';

  beforeEach(async () => {
    store.clear();
    jest.clearAllMocks();
    applyStoreImpl();
    configMock.get.mockImplementation((key: string) => CONFIG_MAP[key]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = module.get<SessionService>(SessionService);
    service.onModuleInit();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });


  describe('claimOnce() — BUG-03 dedup atómico', () => {
    it('devuelve true la 1ª vez y false dentro del TTL para la misma clave', async () => {
      expect(await service.claimOnce('qr:591X', 45)).toBe(true);
      expect(await service.claimOnce('qr:591X', 45)).toBe(false);
    });

    it('claves distintas se reclaman de forma independiente', async () => {
      expect(await service.claimOnce('qr:aaa', 45)).toBe(true);
      expect(await service.claimOnce('qr:bbb', 45)).toBe(true);
    });
  });

  describe('getSession()', () => {
    it('retorna sesión por defecto para un número nuevo', async () => {
      const session = await service.getSession(PHONE);
      expect(session.phoneNumber).toBe(PHONE);
      expect(session.clientId).toBeNull();
      expect(session.isEscalated).toBe(false);
      expect(session.messages).toEqual([]);
    });

    it('retorna la sesión guardada correctamente', async () => {
      await service.updateSession(PHONE, { clientName: 'Virginia López' });
      const session = await service.getSession(PHONE);
      expect(session.clientName).toBe('Virginia López');
    });
  });


  describe('saveSession() / updateSession()', () => {
    it('persiste campos parciales sin perder el resto', async () => {
      await service.updateSession(PHONE, { clientId: 'C001', clientName: 'Ana' });
      await service.updateSession(PHONE, { planName: 'Plan Oro' });

      const session = await service.getSession(PHONE);
      expect(session.clientId).toBe('C001');
      expect(session.clientName).toBe('Ana');
      expect(session.planName).toBe('Plan Oro');
    });

    it('llama a setex con el TTL correcto', async () => {
      await service.saveSession({ phoneNumber: PHONE, clientId: null, clientName: null, clientStatus: null, planId: null, planName: null, totalDebt: 0, tbnCode: null, activeTicketId: null, activeInstallationId: null, pendingAction: null, pendingTechIssue: null, pendingCsatTicketId: null, isEscalated: false, lastSentiment: 'neutral', angryCount: 0, lastLocation: null, pendingImageId: null, pendingImageCaption: null, messages: [] });
      expect(redisMock.setex).toHaveBeenCalledWith(
        `session:${PHONE}`,
        86400,
        expect.any(String),
      );
    });
  });


  describe('addMessage()', () => {
    it('agrega mensajes correctamente', async () => {
      await service.addMessage(PHONE, 'user', 'Hola');
      await service.addMessage(PHONE, 'bot', 'Buenas, ¿en qué te ayudo?');

      const session = await service.getSession(PHONE);
      expect(session.messages).toHaveLength(2);
      expect(session.messages[0].role).toBe('user');
      expect(session.messages[1].role).toBe('bot');
    });

    it('recorta al límite MAX_MESSAGES (5)', async () => {
      for (let i = 0; i < 7; i++) {
        await service.addMessage(PHONE, 'user', `Mensaje ${i}`);
      }
      const session = await service.getSession(PHONE);
      expect(session.messages).toHaveLength(5);
      expect(session.messages[0].content).toBe('Mensaje 2');
    });

    it('incluye timestamp en cada mensaje', async () => {
      const before = Date.now();
      await service.addMessage(PHONE, 'user', 'test');
      const after = Date.now();

      const session = await service.getSession(PHONE);
      const msg = session.messages[session.messages.length - 1];
      expect(msg.content).toBe('test');
      expect(msg.timestamp).toBeGreaterThanOrEqual(before);
      expect(msg.timestamp).toBeLessThanOrEqual(after);
    });
  });


  describe('setClientData()', () => {
    it('guarda todos los campos del cliente', async () => {
      await service.setClientData(PHONE, {
        clientId: 'C123',
        clientName: 'Roberto Mamani',
        clientStatus: 'Activo',
        planId: 'PLAN001',
        planName: 'Plan Plata',
        totalDebt: 150.0,
        tbnCode: 'TBN001',
      });

      const session = await service.getSession(PHONE);
      expect(session.clientId).toBe('C123');
      expect(session.clientName).toBe('Roberto Mamani');
      expect(session.clientStatus).toBe('Activo');
      expect(session.planName).toBe('Plan Plata');
      expect(session.totalDebt).toBe(150.0);
      expect(session.tbnCode).toBe('TBN001');
    });
  });


  describe('escalate() / deescalate()', () => {
    it('marca la sesión como escalada', async () => {
      await service.escalate(PHONE);
      const session = await service.getSession(PHONE);
      expect(session.isEscalated).toBe(true);
    });

    it('devuelve el control al bot y limpia el enojo', async () => {
      await service.escalate(PHONE);
      await service.updateSession(PHONE, { angryCount: 3 });

      await service.deescalate(PHONE);

      const session = await service.getSession(PHONE);
      expect(session.isEscalated).toBe(false);
      expect(session.angryCount).toBe(0);
    });
  });


  describe('setPendingAction()', () => {
    it('guarda y limpia la acción pendiente', async () => {
      await service.setPendingAction(PHONE, 'AWAITING_SLOT_SELECTION');
      let session = await service.getSession(PHONE);
      expect(session.pendingAction).toBe('AWAITING_SLOT_SELECTION');

      await service.setPendingAction(PHONE, null);
      session = await service.getSession(PHONE);
      expect(session.pendingAction).toBeNull();
    });
  });


  describe('getContextText()', () => {
    it('formatea el historial en texto legible', async () => {
      await service.addMessage(PHONE, 'user', 'Cuánto debo?');
      await service.addMessage(PHONE, 'bot', 'Tienes 150 Bs pendientes.');

      const text = await service.getContextText(PHONE);
      expect(text).toContain('Cliente: Cuánto debo?');
      expect(text).toContain('Bot: Tienes 150 Bs pendientes.');
    });

    it('retorna string vacío si no hay mensajes', async () => {
      const FRESH = '59170000003';
      const text = await service.getContextText(FRESH);
      expect(text).toBe('');
    });
  });


  describe('deleteSession()', () => {
    it('elimina la sesión de Redis', async () => {
      await service.updateSession(PHONE, { clientName: 'Test' });
      await service.deleteSession(PHONE);

      expect(redisMock.del).toHaveBeenCalledWith(`session:${PHONE}`);

      const session = await service.getSession(PHONE);
      expect(session.clientId).toBeNull();
    });
  });


  describe('patchSession() — atomic Lua patch (FIX-09)', () => {
    it('crea sesión con defaults si no existe y aplica el patch', async () => {
      await service.patchSession(PHONE, { clientId: 'C-NEW' });
      const session = await service.getSession(PHONE);
      expect(session.clientId).toBe('C-NEW');
      expect(session.isEscalated).toBe(false);
    });

    it('fusiona campos parciales sin borrar los existentes', async () => {
      await service.updateSession(PHONE, { clientId: 'C001', clientName: 'Ana' });
      await service.patchSession(PHONE, { planName: 'Plan Oro' });
      const session = await service.getSession(PHONE);
      expect(session.clientId).toBe('C001');
      expect(session.clientName).toBe('Ana');
      expect(session.planName).toBe('Plan Oro');
    });

    it('sobrescribe solo los campos del patch', async () => {
      await service.updateSession(PHONE, { clientId: 'C001', angryCount: 3 });
      await service.patchSession(PHONE, { angryCount: 0 });
      const session = await service.getSession(PHONE);
      expect(session.angryCount).toBe(0);
      expect(session.clientId).toBe('C001');
    });

    it('no usa distributed lock (sin eval NX)', async () => {
      jest.clearAllMocks();
      applyStoreImpl();
      await service.patchSession(PHONE, { isEscalated: true });
      const evalCalls = redisMock.eval.mock.calls as string[][];
      const hasLockAcquire = evalCalls.some(([script]) => script.includes('NX'));
      expect(hasLockAcquire).toBe(false);
    });

    it('patchSession múltiple sobre la misma sesión acumula todos los cambios', async () => {
      await service.patchSession(PHONE, { clientId: 'C001' });
      await service.patchSession(PHONE, { clientName: 'Roberto' });
      await service.patchSession(PHONE, { totalDebt: 250 });
      const session = await service.getSession(PHONE);
      expect(session.clientId).toBe('C001');
      expect(session.clientName).toBe('Roberto');
      expect(session.totalDebt).toBe(250);
    });
  });


  describe('withLock() — distributed lock (FIX-03)', () => {
    it('adquiere lock (eval NX) y lo libera al terminar', async () => {
      const lockKey = `session:lock:${PHONE}`;
      let wasLocked = false;

      await service.withLock(PHONE, async () => {
        wasLocked = store.has(lockKey);
        return 'done';
      });

      expect(wasLocked).toBe(true);
      expect(store.has(lockKey)).toBe(false);
    });

    it('libera el lock incluso si fn lanza excepción', async () => {
      const lockKey = `session:lock:${PHONE}`;

      await expect(
        service.withLock(PHONE, async () => { throw new Error('test error'); }),
      ).rejects.toThrow('test error');

      expect(store.has(lockKey)).toBe(false);
    });

    it('retorna el valor de fn', async () => {
      const result = await service.withLock(PHONE, async () => 42);
      expect(result).toBe(42);
    });

    it('usa eval para acquire y release (Lua scripts)', async () => {
      await service.withLock(PHONE, async () => 'ok');
      expect(redisMock.eval).toHaveBeenCalledTimes(2);
      const [acquireScript] = (redisMock.eval.mock.calls[0] as string[]);
      expect(acquireScript).toContain('NX');
    });
  });
});
