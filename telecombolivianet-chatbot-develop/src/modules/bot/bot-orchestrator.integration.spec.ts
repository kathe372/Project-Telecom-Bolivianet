/**
 * TEST DE INTEGRACIÓN del orquestador: boota el PIPELINE REAL de 8 handlers +
 * BotOrchestratorService + SessionService + AgentToolRegistry + MessageSender +
 * persistencia, con `ioredis` mockeado en memoria y las fronteras externas
 * (WhatsApp, Gemini/Agent, backend C#) como dobles. Verifica el flujo completo
 * de un mensaje entrante, no piezas aisladas.
 */

// ── ioredis en memoria (compartido) ──────────────────────────────────────────
const store = new Map<string, string>();
const redisMock: any = {
  get:    jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
  set:    jest.fn((k: string, v: string, ...a: string[]) => {
    if (a.includes('NX') && store.has(k)) return Promise.resolve(null);
    store.set(k, v); return Promise.resolve('OK');
  }),
  setex:  jest.fn((k: string, _t: number, v: string) => { store.set(k, v); return Promise.resolve('OK'); }),
  getdel: jest.fn((k: string) => { const v = store.get(k) ?? null; store.delete(k); return Promise.resolve(v); }),
  del:    jest.fn((...ks: string[]) => { let n = 0; for (const k of ks) if (store.delete(k)) n++; return Promise.resolve(n); }),
  ttl:    jest.fn(() => Promise.resolve(-1)),
  keys:   jest.fn(() => Promise.resolve([])),
  scan:   jest.fn(() => Promise.resolve(['0', []])),
  eval:   jest.fn((script: string, _n: number, key: string, ...args: string[]) => {
    if (script.includes('NX')) {                       // LUA_ACQUIRE
      if (store.has(key)) return Promise.resolve(null);
      store.set(key, args[0]); return Promise.resolve('OK');
    }
    if (script.includes('cjson')) {                    // LUA_PATCH
      const raw = store.get(key) ?? args[1];
      const sess = JSON.parse(raw); Object.assign(sess, JSON.parse(args[0]));
      store.set(key, JSON.stringify(sess)); return Promise.resolve('OK');
    }
    if (store.get(key) === args[0]) { store.delete(key); return Promise.resolve(1); }  // LUA_RELEASE
    return Promise.resolve(0);
  }),
  on: jest.fn(() => redisMock),
  disconnect: jest.fn(),
};
jest.mock('ioredis', () => ({ __esModule: true, default: jest.fn(() => redisMock) }));

import { BotOrchestratorService } from './bot-orchestrator.service';
import { SessionService } from '../session/session.service';
import { MessagePersistenceService } from './pipeline/message-persistence.service';
import { MessageSenderService } from './pipeline/message-sender.service';
import { MarkAsReadHandler } from './pipeline/mark-as-read.handler';
import { SessionLoadHandler } from './pipeline/session-load.handler';
import { DebounceHandler } from './pipeline/debounce.handler';
import { MediaDownloadHandler } from './pipeline/media-download.handler';
import { EscalationCheckHandler } from './pipeline/escalation-check.handler';
import { MessagePersistHandler } from './pipeline/message-persist.handler';
import { HumanAvailabilityHandler } from './pipeline/human-availability.handler';
import { ClientIdentificationHandler } from './pipeline/client-identification.handler';
import { AgentToolRegistry } from './tools/agent-tool-registry.service';
import { ActionConfirmationGuard } from './guards/action-confirmation.guard';
import { InteractiveReplyBuilder } from './interactive-reply.builder';
import { FirstContactPolicy } from './pipeline/first-contact.policy';
import { InteractiveIntentMapperService } from './intents/interactive-intent-mapper.service';
import { MainMenuService } from './main-menu.service';
import { AccountChoiceService } from './account-choice.service';
import { InteractiveIdCodec } from './intents/interactive-id.codec';
import { DEFAULT_INTENT_MAP } from './intents/intent-map.config';
import { SESSION_CONSTANTS } from './constants/session.constants';
import { geminiTelemetry } from '../ai/gemini-telemetry';

const DEFAULT_HORARIO = { HoraInicio: '00:00', HoraFin: '23:59', DiasActivos: [true,true,true,true,true,true,true], MensajeFueraHorario: 'cerrado' };
const DEFAULT_CFG = {
  Menu: { TituloMenu: 'Menú', TituloBoton: 'Ver', TituloSeccion: 'Sec', Opciones: [
    { Numero: '1', Etiqueta: '💳 Mi deuda', Intent: 'consulta_deuda', Activa: true, Descripcion: '', SoloCliente: true },
    { Numero: '6', Etiqueta: '👤 Agente', Intent: 'solicitar_agente', Activa: true, Descripcion: '', SoloCliente: false },
  ] },
  Horario: DEFAULT_HORARIO,
  Mensajes: { Bienvenida: 'Hola {nombre}', BienvenidaProspecto: 'Hola prospecto', NoEntendido: 'No entendí', EscaladoAgente: 'Te transfiero a un agente' },
};

function makeSuite(tools: any[] = []) {
  store.clear();
  const config = { get: jest.fn((k: string) => ({ 'redis.sessionTtl': 86400, 'rag.contextMessages': 10, 'bot.debounceWindowMs': 5, 'whatsapp.sendRetryDelayMs': 1 }[k])) };

  // Fronteras externas (dobles)
  const whatsapp = { sendText: jest.fn().mockResolvedValue('wamid.1'), sendList: jest.fn().mockResolvedValue('id'), sendButtons: jest.fn().mockResolvedValue('id'), markAsRead: jest.fn().mockResolvedValue(undefined), downloadMedia: jest.fn() };
  const outbox = { tryDeliverPending: jest.fn().mockResolvedValue(undefined), enqueue: jest.fn().mockResolvedValue(undefined) };
  const mediaStorage = { saveMedia: jest.fn().mockResolvedValue('/uploads/x.jpg') };
  const adminNotifier = { notifyEscalation: jest.fn().mockResolvedValue(undefined) };
  const audioTranscriber = { transcribeBuffer: jest.fn() };
  const eventRecorder = { recordAgentRun: jest.fn() };
  const indicator = { begin: jest.fn().mockReturnValue(() => undefined) };
  const botConfigCache = { getConfig: jest.fn().mockResolvedValue(DEFAULT_CFG) };
  const clientRepo = { getClientsByPhone: jest.fn().mockResolvedValue([]) };
  const ticketRepo = { getClientActiveTickets: jest.fn().mockResolvedValue([]) };
  const convRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    create:  jest.fn((c) => c),
    save:    jest.fn((c) => Promise.resolve({ id: 'conv-1', ...c })),
    upsert:  jest.fn().mockResolvedValue(undefined),
    update:  jest.fn().mockResolvedValue(undefined),
  };
  const msgRepo = { create: jest.fn((m) => m), save: jest.fn().mockResolvedValue(undefined) };
  const memory = { loadReturningContext: jest.fn().mockResolvedValue(null) };
  const agent = {
    detectSentiment: jest.fn().mockResolvedValue('neutral'),
    summarizeConversation: jest.fn().mockResolvedValue(''),
    run: jest.fn().mockResolvedValue({ response: 'Respuesta del bot.', toolsCalled: [] }),
  };

  const session = new SessionService(config as any);
  session.onModuleInit();
  const persistence = new MessagePersistenceService(convRepo as any, msgRepo as any);
  const sender = new MessageSenderService(session, whatsapp as any, outbox as any, persistence, config as any, new InteractiveReplyBuilder());
  const registry: any = new AgentToolRegistry(tools, new ActionConfirmationGuard());
  // Camino determinista del orquestador: se espia para los tests de botones.
  registry.ejecutarSuelta = jest.fn().mockResolvedValue(null);
  const intentMapper = new InteractiveIntentMapperService(DEFAULT_INTENT_MAP);

  const pipeline = [
    new MarkAsReadHandler(whatsapp as any, outbox as any),
    new SessionLoadHandler(session, memory as any),
    new DebounceHandler(config as any),
    new MediaDownloadHandler(whatsapp as any, mediaStorage as any),
    new EscalationCheckHandler(session, persistence, sender),
    new MessagePersistHandler(session, persistence),
    new HumanAvailabilityHandler(botConfigCache as any),
    new ClientIdentificationHandler(session, clientRepo as any, ticketRepo as any, convRepo as any, config as any),
  ];

  const mainMenu = new MainMenuService(botConfigCache as any, sender);
  const accountChoice = new AccountChoiceService(sender, new InteractiveIdCodec());
  const mapsLinkResolver = { resolveShortLink: jest.fn().mockResolvedValue(null) };
  const csatRecorder = { record: jest.fn().mockResolvedValue({ registrado: true, mensaje: '¡Gracias!' }) };
  const procRunner   = {
    ir: jest.fn(),
    enCurso: jest.fn().mockReturnValue(null),
    // Por defecto ningun mensaje abre un procedimiento: el resto de los tests
    // miden el camino normal del agente.
    detectarEntrada: jest.fn().mockResolvedValue(null),
  };
  const instRepoMock = {
    findScheduledInstallationByPhone: jest.fn().mockResolvedValue(null),
    getInstallationById: jest.fn(),
  };
  const procAcciones = { ejecutar: jest.fn().mockResolvedValue({ extra: '', ok: true }) };
  const orch = new BotOrchestratorService(
    pipeline as any, session, whatsapp as any, adminNotifier as any, agent as any,
    registry, audioTranscriber as any, botConfigCache as any, sender, persistence,
    convRepo as any, intentMapper, new FirstContactPolicy(), eventRecorder as any, indicator as any,
    mainMenu, accountChoice, new InteractiveIdCodec(), mapsLinkResolver as any,
    csatRecorder as any, procRunner as any, procAcciones as any, instRepoMock as any,
  );

  return { orch, whatsapp, agent, adminNotifier, eventRecorder, clientRepo, convRepo, session, botConfigCache, csatRecorder, procRunner, procAcciones, instRepoMock, registry };
}

const incoming = (over: any = {}) => ({ from: '59171000001', messageId: 'm-' + Math.random(), type: 'text', ...over });

describe('BotOrchestrator — integración (pipeline real)', () => {
  // El orquestador dispara detectSentiment como fire-and-forget (.then → updateSentiment).
  // Drenamos esa escritura async ANTES del siguiente test para que no contamine el
  // `store` compartido (todos los tests usan el mismo teléfono).
  afterEach(async () => { await new Promise((r) => setTimeout(r, 15)); });

  it('primer contacto → envía el menú de bienvenida y NO llama al agente', async () => {
    const { orch, whatsapp, agent } = makeSuite();
    await orch.handleIncoming(incoming({ text: 'hola' }));
    expect(whatsapp.sendList).toHaveBeenCalled();
    expect(agent.run).not.toHaveBeenCalled();
  });

  it('PASO 6B: saludo suelto DESPUÉS del primer contacto → vuelve a mostrar el menú, no llama al agente', async () => {
    const { orch, whatsapp, agent } = makeSuite();
    await orch.handleIncoming(incoming({ text: 'hola' }));               // 1º: bienvenida (sendList #1)
    await orch.handleIncoming(incoming({ text: '¿qué planes tienen?' })); // 2º: agente
    await orch.handleIncoming(incoming({ text: 'hola' }));                // 3º: saludo suelto de nuevo

    expect(whatsapp.sendList).toHaveBeenCalledTimes(2);
    expect(agent.run).toHaveBeenCalledTimes(1); // solo el turno de la consulta real
  });

  it('PASO 8: tocar una fila con id "plan:<uuid>" arma un contexto claro para el LLM, sin pasar el UUID crudo al mapeador estático', async () => {
    const { orch, agent } = makeSuite();
    await orch.handleIncoming(incoming({ text: 'hola' })); // primer contacto

    await orch.handleIncoming(incoming({
      type: 'interactive',
      interactiveId: 'plan:9f2a1c3b-4d5e-6f70-8192-a3b4c5d6e7f8',
    }));

    expect(agent.run).toHaveBeenCalledWith(
      'El cliente eligió el plan con id 9f2a1c3b-4d5e-6f70-8192-a3b4c5d6e7f8.',
      expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything(),
      expect.anything(),
    );
  });

  it('Auditoría 2026-08: tocar una fila con id "plan:<uuid>" guarda selectedPlanId en sesión — fuente de verdad para create_installation, no depende de que el modelo lo copie bien del historial', async () => {
    const { orch, session } = makeSuite();
    await orch.handleIncoming(incoming({ text: 'hola' })); // primer contacto

    await orch.handleIncoming(incoming({
      type: 'interactive',
      interactiveId: 'plan:9f2a1c3b-4d5e-6f70-8192-a3b4c5d6e7f8',
    }));

    const persisted = await session.getSession('59171000001');
    expect(persisted.selectedPlanId).toBe('9f2a1c3b-4d5e-6f70-8192-a3b4c5d6e7f8');
  });

  it('PASO 8: un id estático de siempre (ej. "solicitar_agente") se sigue resolviendo igual que antes', async () => {
    const { orch, agent } = makeSuite();
    await orch.handleIncoming(incoming({ text: 'hola' })); // primer contacto

    await orch.handleIncoming(incoming({ type: 'interactive', interactiveId: 'solicitar_agente' }));

    const [effectiveText] = agent.run.mock.calls.at(-1)!;
    expect(effectiveText).not.toContain('plan con id');
  });

  it('segundo mensaje de un prospecto → corre el agente y envía su respuesta', async () => {
    const { orch, whatsapp, agent, eventRecorder } = makeSuite();
    await orch.handleIncoming(incoming({ text: 'hola' }));          // 1º: bienvenida
    await orch.handleIncoming(incoming({ text: '¿qué planes tienen?' })); // 2º: agente
    expect(agent.run).toHaveBeenCalledTimes(1);
    expect(whatsapp.sendText).toHaveBeenCalledWith('59171000001', 'Respuesta del bot.');
    expect(eventRecorder.recordAgentRun).toHaveBeenCalled(); // métrica MEJORA-1A
  });

  it('cliente conocido → lo identifica y el prompt lo trata como cliente', async () => {
    const { orch, clientRepo, agent } = makeSuite();
    clientRepo.getClientsByPhone.mockResolvedValue([{ Id: 'C1', FullName: 'jhael', Status: 'Activo', PlanId: 'P1', PlanName: 'Plata', TotalDebt: 149, TbnCode: 'TBN-1' }]);
    await orch.handleIncoming(incoming({ text: 'hola' }));   // bienvenida (con nombre)
    await orch.handleIncoming(incoming({ text: 'cuánto debo' }));
    const sessionArg = agent.run.mock.calls[0][1];
    expect(sessionArg.clientId).toBe('C1');
    expect(sessionArg.clientName).toBe('jhael');
  });

  // 2026-08-07: este test simulaba la escalación poniendo el nombre en
  // `toolsCalled`, que es exactamente la señal que resultó no ser confiable —
  // el registry puede interceptar la escalación y dejar el nombre igual. Medido
  // en producción: el bot respondió bien y la conversación se congeló en
  // silencio. Ahora la escalación tiene que EJECUTARSE de verdad.
  const toolEscalar = {
    getName: () => 'escalate_to_agent',
    getDeclaration: () => ({ name: 'escalate_to_agent' }),
    requiresIdentification: () => false,
    isMutating: () => true,
    execute: jest.fn().mockResolvedValue({ queued: true, deferred: false }),
  };

  it('el agente escala de verdad → dispara escalación y notifica al admin', async () => {
    const { orch, agent, adminNotifier, convRepo } = makeSuite([toolEscalar]);
    await orch.handleIncoming(incoming({ text: 'hola' }));

    agent.run.mockImplementation(async (_t: string, _s: any, _h: any, executor: any) => {
      await executor('escalate_to_agent', { motivo: 'pedido_explicito' });
      return { response: 'Te conecto con un agente.', toolsCalled: ['escalate_to_agent'] };
    });
    await orch.handleIncoming(incoming({ text: 'quiero un agente' }));

    expect(adminNotifier.notifyEscalation).toHaveBeenCalled();
    expect(convRepo.update).toHaveBeenCalledWith({ phoneNumber: '59171000001' }, expect.objectContaining({ isEscalated: true }));
  });

  it('nombrar la herramienta SIN ejecutarla no congela la conversación', async () => {
    const { orch, agent, adminNotifier } = makeSuite([toolEscalar]);
    await orch.handleIncoming(incoming({ text: 'hola' }));

    // El modelo la nombra, pero nunca se ejecutó (caso real: el registry la
    // intercepta y busca en la base en su lugar).
    agent.run.mockResolvedValue({ response: 'El router es en comodato.', toolsCalled: ['escalate_to_agent'] });
    await orch.handleIncoming(incoming({ text: 'el router es mio' }));

    expect(adminNotifier.notifyEscalation).not.toHaveBeenCalled();
  });

  it('mensaje de un botón interactivo → se traduce por el intent-mapper', async () => {
    const { orch, agent } = makeSuite();
    await orch.handleIncoming(incoming({ text: 'hola' }));
    await orch.handleIncoming(incoming({ type: 'interactive', interactiveId: 'consulta_deuda', text: '💳 Mi deuda' }));
    const effectiveText = agent.run.mock.calls[0][0];
    expect(effectiveText).toContain('deuda'); // frase mapeada, no el título del botón
  });

  it('conversación escalada → el bot queda en silencio (no corre el agente)', async () => {
    const { orch, agent, session } = makeSuite();
    await orch.handleIncoming(incoming({ text: 'hola' }));
    await session.escalate('59171000001');
    await orch.handleIncoming(incoming({ text: '¿sigues ahí?' }));
    expect(agent.run).not.toHaveBeenCalled();
  });

  it('mensaje vacío/espacios → no corre el agente', async () => {
    const { orch, agent } = makeSuite();
    await orch.handleIncoming(incoming({ text: 'hola' }));
    await orch.handleIncoming(incoming({ text: '   ' }));
    expect(agent.run).not.toHaveBeenCalled();
  });

  it('registra gemini_calls_per_turn con el nº de llamadas que bloquearon el turno', async () => {
    const { orch, agent } = makeSuite();
    const logSpy = jest.spyOn((orch as any).logger, 'log');
    agent.run.mockImplementation(async () => {
      geminiTelemetry.record();            // simula: decidir herramienta
      geminiTelemetry.record();            // simula: redactar respuesta
      return { response: 'Respuesta del bot.', toolsCalled: [] };
    });

    await orch.handleIncoming(incoming({ text: 'hola' }));       // bienvenida → 0 llamadas (no loguea)
    await orch.handleIncoming(incoming({ text: 'una consulta' })); // agente → 2 llamadas

    const logged = logSpy.mock.calls.map((c) => String(c[0])).filter((s) => s.includes('gemini_calls_per_turn'));
    expect(logged).toHaveLength(1);        // solo el 2º turno superó 0 llamadas
    expect(logged[0]).toContain('"calls":2');
  });

  it('imagen sin caption → escala a un agente humano y NO corre el agente', async () => {
    const { orch, agent, adminNotifier, whatsapp } = makeSuite();
    whatsapp.downloadMedia.mockResolvedValue(Buffer.from('jpeg-bytes'));
    await orch.handleIncoming(incoming({ text: 'hola' }));                       // 1º: bienvenida
    await orch.handleIncoming(incoming({ type: 'image', imageId: 'img-1' }));    // imagen sin texto

    expect(adminNotifier.notifyEscalation).toHaveBeenCalled();
    expect(agent.run).not.toHaveBeenCalled();
  });

  it('BUG-01: audio con fallo de descarga (storage caído) → pide texto y NO escala', async () => {
    const { orch, agent, adminNotifier, whatsapp } = makeSuite();
    whatsapp.downloadMedia.mockRejectedValue(new Error('getaddrinfo ENOTFOUND supabase'));
    await orch.handleIncoming(incoming({ text: 'hola' }));                       // 1º: bienvenida
    await orch.handleIncoming(incoming({ type: 'audio', audioId: 'aud-1' }));    // nota de voz que no se puede bajar

    expect(adminNotifier.notifyEscalation).not.toHaveBeenCalled();               // NO escala por fallo técnico
    expect(agent.run).not.toHaveBeenCalled();
    const textos = whatsapp.sendText.mock.calls.map((c: any[]) => String(c[1])).join(' ');
    expect(textos).toContain('problema técnico');                                // pide escribirlo por texto
  });

  it('URL de Google Maps → guarda la ubicación y pasa el texto transformado al agente', async () => {
    const { orch, agent, session } = makeSuite();
    await orch.handleIncoming(incoming({ text: 'hola' }));                                  // 1º: bienvenida
    await orch.handleIncoming(incoming({ text: 'https://www.google.com/maps?q=-17.389,-66.156' }));

    // el agente recibe la frase de ubicación, no la URL cruda
    const effectiveText = agent.run.mock.calls[0][0];
    expect(effectiveText).toContain('latitud');
    expect(effectiveText).toContain('-17.389');
    // y la ubicación quedó persistida en la sesión
    const stored = await session.getSession('59171000001');
    expect(stored?.lastLocation).toEqual({ lat: -17.389, lng: -66.156 });
    expect(stored?.locationSource).toBe('google_maps');
  });

  // ── PASO 3: _suppressResponse dividido en _mediaDelivered / _noOp ──────────
  // Reproduce el bug real de la conversación capturada: el cliente pide el QR,
  // y en el mismo turno (o el siguiente) pregunta algo más — antes, si la tool
  // deduplicaba el QR (_noOp), el turno entero quedaba mudo.

  it('PASO 3: tool deduplicada (_noOp) NO apaga la respuesta del LLM en el mismo turno', async () => {
    const stubTool = {
      getName:                () => 'send_payment_qr',
      requiresIdentification: () => false,
      isMutating:              () => true,
      getDeclaration:          () => ({ name: 'send_payment_qr', description: 'stub' }),
      execute:                 jest.fn().mockResolvedValue({ sent: false, deduped: true, _noOp: true }),
    };
    const { orch, whatsapp, agent } = makeSuite([stubTool]);
    await orch.handleIncoming(incoming({ text: 'hola' })); // 1º: bienvenida

    agent.run.mockImplementation(async (_text: string, _session: any, _history: any, executor: any) => {
      await executor('send_payment_qr', {}); // el LLM decide reintentar el QR — dedup, _noOp
      return { response: 'En mayo tu plan era distinto, por eso el monto cambió.', toolsCalled: ['send_payment_qr'] };
    });
    await orch.handleIncoming(incoming({ text: 'porque mi deuda de mayo es mayor' }));

    // la pregunta del cliente SÍ recibe respuesta — no se queda en silencio
    expect(whatsapp.sendText).toHaveBeenCalledWith(
      '59171000001',
      'En mayo tu plan era distinto, por eso el monto cambió.',
    );
  });

  it('PASO 3: tool que entrega contenido directo (_mediaDelivered) SÍ apaga la respuesta del LLM', async () => {
    const stubTool = {
      getName:                () => 'send_payment_qr',
      requiresIdentification: () => false,
      isMutating:              () => true,
      getDeclaration:          () => ({ name: 'send_payment_qr', description: 'stub' }),
      execute:                 jest.fn().mockResolvedValue({ sent: true, _mediaDelivered: true }),
    };
    const { orch, whatsapp, agent } = makeSuite([stubTool]);
    await orch.handleIncoming(incoming({ text: 'hola' })); // 1º: bienvenida

    agent.run.mockImplementation(async (_text: string, _session: any, _history: any, executor: any) => {
      await executor('send_payment_qr', {}); // el LLM manda la imagen del QR
      return { response: 'texto redundante que no debe duplicar la imagen', toolsCalled: ['send_payment_qr'] };
    });
    await orch.handleIncoming(incoming({ text: 'quiero pagar' }));

    // el texto redactado por el LLM NO se envía — ya se entregó la imagen directamente
    expect(whatsapp.sendText).not.toHaveBeenCalledWith(
      '59171000001',
      'texto redundante que no debe duplicar la imagen',
    );
  });

  // ── PASO 4B: el horario de atención solo debe afectar escalamientos a un
  // agente humano — el resto del bot debe seguir funcionando siempre.
  // Fija el comportamiento correcto (ya lo era) tras eliminar el manejador
  // de horario muerto (schedule-check.handler.ts) que, si alguna vez se
  // hubiera conectado por error, habría cortado el pipeline completo.
  it('PASO 4B: fuera del horario configurado, una consulta sin relación con agentes se procesa con normalidad', async () => {
    const { orch, whatsapp, agent, botConfigCache } = makeSuite();
    botConfigCache.getConfig.mockResolvedValue({
      ...DEFAULT_CFG,
      Horario: { ...DEFAULT_HORARIO, DiasActivos: [false, false, false, false, false, false, false] }, // ningún día activo → siempre "fuera de horario"
    });

    await orch.handleIncoming(incoming({ text: 'hola' }));           // 1º: bienvenida
    await orch.handleIncoming(incoming({ text: 'cuál es mi deuda' })); // 2º: consulta normal, no pide agente

    expect(agent.run).toHaveBeenCalledTimes(1);
    expect(whatsapp.sendText).toHaveBeenCalledWith('59171000001', 'Respuesta del bot.');
  });


  // 2026-08-07: el cliente tocó el botón de calificación, el `csat:N` llegó
  // perfecto y el turno murió con un 429 de Gemini — toolsCalled vacío,
  // calificación perdida. El id ya trae la nota resuelta: no puede depender
  // del modelo para guardarse.
  describe('calificación por botón — camino determinista', () => {
    it('registra la nota sin llamar al agente', async () => {
      const { orch, agent, csatRecorder, whatsapp } = makeSuite();

      await orch.handleIncoming(incoming({
        type: 'interactive', interactiveId: 'csat:4', text: '⭐⭐⭐⭐ Buena',
      }));

      expect(csatRecorder.record).toHaveBeenCalledWith(expect.anything(), 4);
      // Lo esencial: Gemini queda fuera del camino.
      expect(agent.run).not.toHaveBeenCalled();
      expect(whatsapp.sendText).toHaveBeenCalledWith(expect.anything(), '¡Gracias!');
    });

    it('si el registro falla, se le dice al cliente en vez de agradecer', async () => {
      const { orch, agent, csatRecorder, whatsapp } = makeSuite();
      csatRecorder.record.mockResolvedValueOnce({
        registrado: false, mensaje: 'No pude guardar tu calificación en este momento.',
      });

      await orch.handleIncoming(incoming({
        type: 'interactive', interactiveId: 'csat:1', text: '⭐ Muy mala',
      }));

      expect(agent.run).not.toHaveBeenCalled();
      expect(whatsapp.sendText).toHaveBeenCalledWith(
        expect.anything(), 'No pude guardar tu calificación en este momento.',
      );
    });
  });


  // El procedimiento de soporte NO pasa por el modelo: el documento define el
  // texto, los botones y las acciones. Se llego a esto midiendo que el RAG por
  // similitud no puede secuenciar un flujo (2/6, y 5/6 con margenes de 0.02).
  describe('procedimiento guiado por documento', () => {
    const paso = (extra: Record<string, unknown> = {}) => ({
      clave: 'la luz esta verde',
      texto: 'Desenchufá el módem 10 segundos.',
      botones: [
        { id: 'proc:reinicie y mejoro',  title: '✅ Mejoró' },
        { id: 'proc:reinicie y sigue',   title: '❌ Sigue igual' },
      ],
      acciones: [],
      ...extra,
    });

    it('tocar un botón avanza al bloque, sin llamar al agente', async () => {
      const { orch, agent, procRunner, whatsapp } = makeSuite();
      await orch.handleIncoming(incoming({ text: 'hola' }));
      procRunner.ir.mockResolvedValue(paso());

      await orch.handleIncoming(incoming({
        type: 'interactive', interactiveId: 'proc:la luz esta verde', text: '🟢 Verde',
      }));

      expect(procRunner.ir).toHaveBeenCalledWith('la luz esta verde', expect.anything());
      // Gemini queda fuera del camino: es lo que hace determinista al flujo.
      expect(agent.run).not.toHaveBeenCalled();
      expect(whatsapp.sendButtons).toHaveBeenCalled();
    });

    it('ejecuta las acciones ANTES de mandar el mensaje', async () => {
      const { orch, procRunner, procAcciones, whatsapp } = makeSuite();
      await orch.handleIncoming(incoming({ text: 'hola' }));
      procRunner.ir.mockResolvedValue(paso({
        botones: [], acciones: [{ name: 'crear_ticket', params: { tipo: 'velocidad_lenta' } }],
        texto: 'Necesitamos revisarlo nosotros.',
      }));
      procAcciones.ejecutar.mockResolvedValue({ extra: 'Registré el ticket *TBN-0099*.', ok: true });

      await orch.handleIncoming(incoming({
        type: 'interactive', interactiveId: 'proc:reinicie y sigue', text: '❌ Sigue igual',
      }));

      // El numero de ticket que lee el cliente corresponde a uno que existe.
      expect(procAcciones.ejecutar).toHaveBeenCalled();
      const enviado = whatsapp.sendText.mock.calls.at(-1)[1];
      expect(enviado).toContain('TBN-0099');
    });

    it('un bloque sin botones cierra el procedimiento en sesión', async () => {
      const { orch, procRunner, session } = makeSuite();
      await orch.handleIncoming(incoming({ text: 'hola' }));
      procRunner.ir.mockResolvedValue(paso({ botones: [], texto: 'Perfecto, ya quedó resuelto.' }));

      await orch.handleIncoming(incoming({
        type: 'interactive', interactiveId: 'proc:reinicie y mejoro', text: '✅ Mejoró',
      }));

      const s = await session.getSession('59171000001');
      expect(s.procedimientoActual).toBeNull();
    });

    // Si el documento cambio y el bloque ya no existe, no se inventa un paso.
    // Medido en produccion: el boton "🔧 Soporte tecnico" del menu llega como id
    // interactivo estatico, y la condicion exigia texto libre — asi que caia al
    // camino viejo y el RAG parafraseaba el bloque de entrada sin botones.
    it('el botón del menú también abre el procedimiento', async () => {
      const { orch, agent, procRunner, whatsapp } = makeSuite();
      await orch.handleIncoming(incoming({ text: 'hola' }));
      procRunner.detectarEntrada.mockResolvedValue('no tengo internet');
      procRunner.ir.mockResolvedValue(paso());

      await orch.handleIncoming(incoming({
        type: 'interactive', interactiveId: 'soporte_tecnico', text: '🔧 Soporte técnico',
      }));

      expect(procRunner.detectarEntrada).toHaveBeenCalled();
      expect(agent.run).not.toHaveBeenCalled();
      expect(whatsapp.sendButtons).toHaveBeenCalled();
    });

    // 2026-08-08: `detectarEntrada` calcula un embedding, y eso es una llamada
    // a Gemini. Correrla cuando el cliente tocó una fila que generamos nosotros
    // es gasto puro: el significado ya está resuelto por el codec.
    //
    // Medido en producción: el cliente tocó "Martes 11/08 12:20" y se gastó un
    // embedding para concluir `arranca:false, similitud:0.502`. El turno
    // siguiente murió con 429 RESOURCE_EXHAUSTED — íbamos a 3-4 llamadas por
    // turno.
    it('tocar una fila de horario NO gasta embedding de entrada', async () => {
      const { orch, procRunner } = makeSuite();
      await orch.handleIncoming(incoming({ text: 'hola' }));
      procRunner.detectarEntrada.mockClear();

      await orch.handleIncoming(incoming({
        type: 'interactive', interactiveId: 'slot:2026-08-11 12:20', text: 'Martes 11/08 12:20',
      }));

      expect(procRunner.detectarEntrada).not.toHaveBeenCalled();
    });

    it('tocar una fila de plan tampoco lo gasta', async () => {
      const { orch, procRunner } = makeSuite();
      await orch.handleIncoming(incoming({ text: 'hola' }));
      procRunner.detectarEntrada.mockClear();

      await orch.handleIncoming(incoming({
        type: 'interactive',
        interactiveId: 'plan:2b7d0924-fa53-4059-aba2-ae159785eb25',
        text: 'PLATA',
      }));

      expect(procRunner.detectarEntrada).not.toHaveBeenCalled();
    });

    // La contracara: el ahorro no puede llevarse puesto el caso que el botón
    // del menú vino a arreglar. Si esto se pone en verde por accidente, el
    // ahorro se comió el flujo de soporte.
    it('el texto libre SÍ sigue evaluándose', async () => {
      const { orch, procRunner } = makeSuite();
      await orch.handleIncoming(incoming({ text: 'hola' }));
      procRunner.detectarEntrada.mockClear();

      await orch.handleIncoming(incoming({ text: 'no tengo internet' }));

      expect(procRunner.detectarEntrada).toHaveBeenCalled();
    });

    it('un bloque inexistente escala en vez de improvisar', async () => {
      const { orch, procRunner, adminNotifier } = makeSuite();
      await orch.handleIncoming(incoming({ text: 'hola' }));
      procRunner.ir.mockResolvedValue(null);

      await orch.handleIncoming(incoming({
        type: 'interactive', interactiveId: 'proc:bloque borrado', text: 'x',
      }));

      expect(adminNotifier.notifyEscalation).toHaveBeenCalled();
    });
  });


  // Medido en produccion (2026-08-07): el cliente toco "📅 Instalacion",
  // teniendo una agendada, y el bot ESCALO a un agente humano con el motivo
  // "el cliente solicito hablar con una persona" — que nunca dijo.
  //
  // El boton significaba "agendar o consultar" y el modelo elegia. Al quitarle
  // el "consultar" para desambiguar, quedo sin regla para quien ya tiene una, y
  // lleno el hueco improvisando. No es ambiguedad: es un `if` sobre un dato.
  describe('botón "Instalación": bifurca con datos, no con el modelo', () => {
    it('si ya tiene una, la muestra con opciones — sin llamar al agente', async () => {
      const { orch, agent, instRepoMock, whatsapp } = makeSuite();
      await orch.handleIncoming(incoming({ text: 'hola' }));
      instRepoMock.findScheduledInstallationByPhone.mockResolvedValue('ins-1');
      instRepoMock.getInstallationById.mockResolvedValue({
        Fecha: '2026-08-11', HoraInicio: '14:40', Status: 'Pendiente', PlanNombre: 'COBRE',
      });

      await orch.handleIncoming(incoming({
        type: 'interactive', interactiveId: 'solicitar_instalacion', text: '📅 Instalación',
      }));

      expect(agent.run).not.toHaveBeenCalled();
      expect(whatsapp.sendButtons).toHaveBeenCalled();
      const texto = whatsapp.sendButtons.mock.calls.at(-1)[1];
      expect(texto).toContain('2026-08-11');
      expect(texto).toContain('COBRE');
    });

    it('si no tiene, pide la ubicación y arranca el alta', async () => {
      const { orch, agent, instRepoMock, whatsapp } = makeSuite();
      await orch.handleIncoming(incoming({ text: 'hola' }));
      instRepoMock.findScheduledInstallationByPhone.mockResolvedValue(null);

      await orch.handleIncoming(incoming({
        type: 'interactive', interactiveId: 'solicitar_instalacion', text: '📅 Instalación',
      }));

      expect(agent.run).not.toHaveBeenCalled();
      expect(whatsapp.sendText.mock.calls.at(-1)[1]).toMatch(/ubicaci[oó]n/i);
    });

    // Una instalacion cerrada no bloquea un alta nueva.
    it('una instalación cancelada no cuenta como vigente', async () => {
      const { orch, instRepoMock, whatsapp } = makeSuite();
      await orch.handleIncoming(incoming({ text: 'hola' }));
      instRepoMock.findScheduledInstallationByPhone.mockResolvedValue('ins-2');
      instRepoMock.getInstallationById.mockResolvedValue({
        Fecha: '2026-08-11', HoraInicio: '14:40', Status: 'Cancelada',
      });

      await orch.handleIncoming(incoming({
        type: 'interactive', interactiveId: 'solicitar_instalacion', text: '📅 Instalación',
      }));

      expect(whatsapp.sendText.mock.calls.at(-1)[1]).toMatch(/ubicaci[oó]n/i);
    });

    // Si falla la consulta, seguimos por el alta: pedir la ubicacion nunca esta
    // de mas, y colgar al cliente por un problema nuestro, si.
    it('si la consulta falla, arranca el alta igual', async () => {
      const { orch, instRepoMock, whatsapp } = makeSuite();
      await orch.handleIncoming(incoming({ text: 'hola' }));
      instRepoMock.findScheduledInstallationByPhone.mockRejectedValue(new Error('backend caído'));

      await orch.handleIncoming(incoming({
        type: 'interactive', interactiveId: 'solicitar_instalacion', text: '📅 Instalación',
      }));

      expect(whatsapp.sendText.mock.calls.at(-1)[1]).toMatch(/ubicaci[oó]n/i);
    });
  });


  // Medido en produccion (2026-08-07): al tocar "Reprogramar" el bot dijo
  // "indicame la nueva fecha y hora". El cliente escribio "Mañana", el modelo
  // lo resolvio al 08/08 10:00, y el backend lo rechazo porque no era un
  // horario disponible. Dos turnos para terminar en "hubo un problema", con la
  // lista de horarios reales a una consulta de distancia.
  describe('botón "Reprogramar": muestra los horarios reales', () => {
    it('manda la lista en vez de pedir la fecha escrita', async () => {
      const { orch, agent, registry, whatsapp } = makeSuite();
      await orch.handleIncoming(incoming({ text: 'hola' }));
      registry.ejecutarSuelta.mockResolvedValue({
        _list: { buttonLabel: 'Ver horarios', sections: [{ title: 'x', rows: [] }] },
      });

      await orch.handleIncoming(incoming({
        type: 'interactive', interactiveId: 'reagendar_instalacion', text: '📅 Reprogramar',
      }));

      expect(registry.ejecutarSuelta).toHaveBeenCalledWith(
        'get_installation_slots', {}, expect.anything(),
      );
      expect(agent.run).not.toHaveBeenCalled();
      expect(whatsapp.sendList).toHaveBeenCalled();
    });

    // Sin horarios no se inventa un camino: se dice y se ofrece un agente.
    it('si no hay horarios, lo dice en vez de pedir una fecha', async () => {
      const { orch, registry, whatsapp } = makeSuite();
      await orch.handleIncoming(incoming({ text: 'hola' }));
      registry.ejecutarSuelta.mockResolvedValue(null);

      await orch.handleIncoming(incoming({
        type: 'interactive', interactiveId: 'reagendar_instalacion', text: '📅 Reprogramar',
      }));

      expect(whatsapp.sendText.mock.calls.at(-1)[1]).toMatch(/no pude traer los horarios/i);
    });
  });


  // Medido en produccion (2026-08-07): "Hola quiero realizar la instalación" ->
  // el bot ejecuto send_payment_qr. Entendio la frase; se equivoco al elegir
  // entre 25 herramientas, arrastrando que el cliente habia pedido el QR
  // minutos antes en esa misma conversacion.
  describe('intención de negocio en texto libre', () => {
    it('"quiero realizar la instalación" NO pasa por el modelo', async () => {
      const { orch, agent, instRepoMock, whatsapp } = makeSuite();
      await orch.handleIncoming(incoming({ text: 'hola' }));
      instRepoMock.findScheduledInstallationByPhone.mockResolvedValue(null);

      await orch.handleIncoming(incoming({ text: 'quiero realizar la instalación' }));

      expect(agent.run).not.toHaveBeenCalled();
      expect(whatsapp.sendText.mock.calls.at(-1)[1]).toMatch(/ubicaci[oó]n/i);
    });

    it('si ya tiene una agendada, se la muestra', async () => {
      const { orch, agent, instRepoMock, whatsapp } = makeSuite();
      await orch.handleIncoming(incoming({ text: 'hola' }));
      instRepoMock.findScheduledInstallationByPhone.mockResolvedValue('ins-1');
      instRepoMock.getInstallationById.mockResolvedValue({
        Fecha: '2026-08-11', HoraInicio: '14:40', Status: 'Pendiente',
      });

      await orch.handleIncoming(incoming({ text: 'necesito contratar internet' }));

      expect(agent.run).not.toHaveBeenCalled();
      expect(whatsapp.sendButtons).toHaveBeenCalled();
    });

    // Una pregunta informativa la responde el RAG, no el flujo de alta.
    it('una consulta sobre la instalación SÍ va al modelo', async () => {
      const { orch, agent } = makeSuite();
      await orch.handleIncoming(incoming({ text: 'hola' }));

      await orch.handleIncoming(incoming({ text: '¿cuánto cuesta la instalación?' }));

      expect(agent.run).toHaveBeenCalled();
    });
  });

});
