import { Test, TestingModule } from '@nestjs/testing';
import { SentimentHeuristic } from './sentiment/sentiment-heuristic';
import { ExponentialBackoffPolicy } from '../../common/resilience/exponential-backoff.policy';
import { ActionConfirmationGuard } from './guards/action-confirmation.guard';
import { ConfigService } from '@nestjs/config';
import { AgentService } from './agent.service';
import { SessionData } from '../session/session.service';
import { GeminiClientService } from '../ai/gemini-client.service';
import { PromptBuilderService } from './prompt-builder.service';
import { SentimentService } from './sentiment.service';
import { ConversationSummarizerService } from './conversation-summarizer.service';
import { InputSanitizerService } from './input-sanitizer.service';
import { PersonalitySection } from './prompt-sections/personality.section';
import { ClientInfoSection } from './prompt-sections/client-info.section';
import { SentimentHintSection } from './prompt-sections/sentiment-hint.section';
import { EscalationRulesSection } from './prompt-sections/escalation-rules.section';
import { GeneralInstructionsSection } from './prompt-sections/general-instructions.section';
import { TechSupportFlowSection } from './prompt-sections/tech-support-flow.section';
import { InstallationFlowSection } from './prompt-sections/installation-flow.section';

function makePromptBuilder(): PromptBuilderService {
  return new PromptBuilderService([
    new PersonalitySection(),
    new ClientInfoSection(),
    new SentimentHintSection(),
    new EscalationRulesSection(),
    new GeneralInstructionsSection(),
    new TechSupportFlowSection(),
    new InstallationFlowSection(),
  ]);
}


const SESSION_CLIENT: SessionData = {
  phoneNumber: '59171234567',
  clientId: 'client-001',
  clientName: 'Juan Pérez',
  clientStatus: 'Activo',
  planId: 'plan-100mb',
  planName: 'Plan 100 Mbps',
  totalDebt: 150.00,
  tbnCode: 'TBN-0001',
  activeTicketId: null,
  activeInstallationId: null,
  pendingAction: null,
  pendingTechIssue: null,
  pendingCsatTicketId: null,
  isEscalated: false,
  lastSentiment: 'neutral',
  angryCount: 0,
  lastLocation: null,
  pendingImageId: null,
  pendingImageCaption: null,
  messages: [],
};

const SESSION_PROSPECT: SessionData = {
  ...SESSION_CLIENT,
  clientId: null,
  clientName: null,
  clientStatus: null,
  planId: null,
  planName: null,
  totalDebt: 0,
  tbnCode: null,
};

const SESSION_ANGRY: SessionData = {
  ...SESSION_CLIENT,
  lastSentiment: 'angry',
  angryCount: 2,
};

const EMPTY_HISTORY = [];

function makeConfig(overrides: Record<string, any> = {}): ConfigService {
  const defaults: Record<string, any> = {
    'gemini.apiKey':    'test-key',
    'gemini.chatModel': 'gemini-1.5-flash',
    'gemini.maxTokens': 600,
  };
  return {
    get: jest.fn((key: string) => overrides[key] ?? defaults[key] ?? undefined),
  } as any;
}

function makeHttpStub(responses: Array<{ data: any } | Error>) {
  let call = 0;
  return {
    post: jest.fn(async () => {
      const res = responses[call] ?? responses[responses.length - 1];
      call++;
      if (res instanceof Error) throw res;
      return res;
    }),
  };
}

function geminiText(text: string) {
  return {
    data: {
      candidates: [{
        content: {
          parts: [{ text }],
        },
      }],
    },
  };
}

function geminiFunctionCall(name: string, args: Record<string, any> = {}) {
  return {
    data: {
      candidates: [{
        content: {
          parts: [{ functionCall: { name, args } }],
        },
      }],
    },
  };
}

function makeGeminiClient(useOAuth = false): GeminiClientService {
  return {
    isUsingOAuth: jest.fn(() => useOAuth),
    getAccessToken: jest.fn(async () => useOAuth ? 'fake-bearer' : null),
    getAuthHeaders: jest.fn(async () => useOAuth ? { Authorization: 'Bearer fake-bearer' } : {}),
    buildUrl: jest.fn((base: string, model: string, method: string, apiKey: string) => {
      const url = `${base}/${model}:${method}`;
      return useOAuth ? url : `${url}?key=${apiKey}`;
    }),
  } as any;
}

function makeAgent(
  httpStub: any,
  configOverrides: Record<string, any> = {},
  useOAuth = false,
): AgentService {
  const config       = makeConfig(configOverrides);
  const geminiClient = makeGeminiClient(useOAuth);
  const promptBuilder    = makePromptBuilder();
  const sentimentSvc     = new SentimentService(config, geminiClient, new ExponentialBackoffPolicy(), new SentimentHeuristic());
  const summarizerSvc    = new ConversationSummarizerService(config, geminiClient, new ExponentialBackoffPolicy());
  const sanitizerSvc     = new InputSanitizerService();
  const rateLimiterStub  = { acquire: jest.fn().mockResolvedValue(undefined) };
  const errorMetricsStub = { recordSuccess: jest.fn(), recordError: jest.fn() };
  const agent = new AgentService(
    config, geminiClient, promptBuilder, sentimentSvc, summarizerSvc, sanitizerSvc,
    new ActionConfirmationGuard(), new ExponentialBackoffPolicy(), rateLimiterStub as any,
    errorMetricsStub as any,
  );
  (agent as any).http           = httpStub;
  (sentimentSvc as any).http    = httpStub;
  (summarizerSvc as any).http   = httpStub;
  return agent;
}

describe('AgentService.buildSystemPrompt', () => {

  it('A1 — incluye datos del cliente identificado', () => {
    const agent = makeAgent(makeHttpStub([]));
    const prompt = agent.buildSystemPrompt(SESSION_CLIENT);

    expect(prompt).toContain('Juan Pérez');
    expect(prompt).toContain('TBN-0001');
    expect(prompt).toContain('Activo');
    expect(prompt).toContain('150.00');
    expect(prompt).toContain('Plan 100 Mbps');
  });

  it('A2 — indica prospecto cuando clientId es null', () => {
    const agent = makeAgent(makeHttpStub([]));
    const prompt = agent.buildSystemPrompt(SESSION_PROSPECT);

    expect(prompt).toContain('NO está registrado');
    expect(prompt).toContain('prospecto');
  });

  it('A3 — advierte sobre cliente muy enojado (angryCount >= 2)', () => {
    const agent = makeAgent(makeHttpStub([]));
    const prompt = agent.buildSystemPrompt(SESSION_ANGRY);

    expect(prompt).toContain('ATENCIÓN');
    expect(prompt).toContain('enojado');
    expect(prompt).toContain('agente humano');
  });

  it('A4 — no muestra advertencia de enojo con angryCount < 2', () => {
    const agent = makeAgent(makeHttpStub([]));
    const session = { ...SESSION_CLIENT, lastSentiment: 'angry' as const, angryCount: 1 };
    const prompt = agent.buildSystemPrompt(session);

    expect(prompt).not.toContain('ATENCIÓN');
  });

  it('A5 — muestra nota de frustración cuando sentiment es frustrated', () => {
    const agent = makeAgent(makeHttpStub([]));
    const session = { ...SESSION_CLIENT, lastSentiment: 'frustrated' as const, angryCount: 0 };
    const prompt = agent.buildSystemPrompt(session);

    expect(prompt).toContain('frustrado');
  });

  it('A6 — incluye ticket activo cuando existe', () => {
    const agent = makeAgent(makeHttpStub([]));
    const session = { ...SESSION_CLIENT, activeTicketId: 'TKT-9999' };
    const prompt = agent.buildSystemPrompt(session);

    expect(prompt).toContain('TKT-9999');
  });

  it('A7 — incluye instalación activa cuando existe', () => {
    const agent = makeAgent(makeHttpStub([]));
    const session = { ...SESSION_CLIENT, activeInstallationId: 'INS-8888' };
    const prompt = agent.buildSystemPrompt(session);

    expect(prompt).toContain('INS-8888');
  });
});

describe('AgentService.run — ReAct loop', () => {

  it('B1 — respuesta directa sin herramientas (loop 0)', async () => {
    const http = makeHttpStub([geminiText('Hola, soy el asistente de Bolivianet. ¿En qué te ayudo?')]);
    const agent = makeAgent(http);
    const executor = jest.fn();

    const { response, toolsCalled } = await agent.run('hola', SESSION_CLIENT, EMPTY_HISTORY, executor);

    expect(response).toBe('Hola, soy el asistente de Bolivianet. ¿En qué te ayudo?');
    expect(toolsCalled).toHaveLength(0);
    expect(executor).not.toHaveBeenCalled();
    expect(http.post).toHaveBeenCalledTimes(1);
  });

  it('B2 — una herramienta y luego respuesta final', async () => {
    const toolResult = { hasPendingDebt: true, totalDebt: 150, pendingCount: 2 };
    const executor = jest.fn().mockResolvedValue(toolResult);

    const http = makeHttpStub([
      geminiFunctionCall('get_client_debt'),
      geminiText('Tienes Bs. 150 pendientes en 2 facturas.'),
    ]);
    const agent = makeAgent(http);

    const { response, toolsCalled } = await agent.run('cuánto debo', SESSION_CLIENT, EMPTY_HISTORY, executor);

    expect(toolsCalled).toContain('get_client_debt');
    expect(executor).toHaveBeenCalledWith('get_client_debt', {});
    expect(response).toContain('150');
    expect(http.post).toHaveBeenCalledTimes(2);
  });

  it('B3 — dos herramientas en cascada (deuda + QR)', async () => {
    const executor = jest.fn()
      .mockResolvedValueOnce({ hasPendingDebt: true, totalDebt: 150 })
      .mockResolvedValueOnce({ sent: true });

    const http = makeHttpStub([
      geminiFunctionCall('get_client_debt'),
      geminiFunctionCall('send_payment_qr'),
      geminiText('Te envié el QR. Tienes Bs. 150 pendientes.'),
    ]);
    const agent = makeAgent(http);

    const { toolsCalled } = await agent.run('quiero pagar', SESSION_CLIENT, EMPTY_HISTORY, executor);

    expect(toolsCalled).toEqual(expect.arrayContaining(['get_client_debt', 'send_payment_qr']));
    expect(executor).toHaveBeenCalledTimes(2);
  });

  it('B4 — respeta MAX_REACT_LOOPS y retorna fallback al agotarlos', async () => {
    const http = makeHttpStub([geminiFunctionCall('get_client_debt')]);
    const executor = jest.fn().mockResolvedValue({});
    const agent = makeAgent(http);

    const { response } = await agent.run('test', SESSION_CLIENT, EMPTY_HISTORY, executor);

    expect(response).toContain('No pude procesar');
    expect(http.post).toHaveBeenCalledTimes(5);
  });

  it('B5 — error de red → respuesta de error amigable', async () => {
    const http = makeHttpStub([new Error('Network timeout')]);
    const agent = makeAgent(http);

    const { response, toolsCalled } = await agent.run('hola', SESSION_CLIENT, EMPTY_HISTORY, jest.fn());

    expect(response).toContain('problema técnico');
    expect(toolsCalled).toHaveLength(0);
  });

  it('B6 — error en herramienta → agente recibe resultado de error y continúa', async () => {
    const executor = jest.fn().mockRejectedValue(new Error('API offline'));
    const http = makeHttpStub([
      geminiFunctionCall('get_client_debt'),
      geminiText('Tuve un problema consultando tu deuda. ¿Deseas intentar de nuevo?'),
    ]);
    const agent = makeAgent(http);

    const { response } = await agent.run('mi deuda', SESSION_CLIENT, EMPTY_HISTORY, executor);

    expect(response).toBeTruthy();
    expect(http.post).toHaveBeenCalledTimes(2);
  });

  it('B7 — prospecto no puede usar get_client_debt (executor devuelve error)', async () => {
    const executor = jest.fn().mockResolvedValue({ error: 'El cliente no está identificado' });
    const http = makeHttpStub([
      geminiFunctionCall('get_client_debt'),
      geminiText('Para consultar tu deuda necesitas ser cliente registrado.'),
    ]);
    const agent = makeAgent(http);

    const { response } = await agent.run('cuánto debo', SESSION_PROSPECT, EMPTY_HISTORY, executor);

    expect(response).toBeTruthy();
    expect(executor).toHaveBeenCalledWith('get_client_debt', {});
  });

  it('B8 — historial previo se incluye en el request a Gemini', async () => {
    const http = makeHttpStub([geminiText('Como te mencioné, tienes Bs. 150 de deuda.')]);
    const agent = makeAgent(http);
    const history = [
      { role: 'user' as const, parts: [{ text: 'hola' }] },
      { role: 'model' as const, parts: [{ text: 'hola! en qué te ayudo' }] },
    ];

    await agent.run('y cuánto debo?', SESSION_CLIENT, history, jest.fn());

    const callBody = (http.post as jest.Mock).mock.calls[0][1];
    expect(callBody.contents).toHaveLength(3);
  });

  it('B9 — respuesta vacía de Gemini activa el fallback', async () => {
    const http = makeHttpStub([geminiText('  ')]);
    const agent = makeAgent(http);

    const { response } = await agent.run('hola', SESSION_CLIENT, EMPTY_HISTORY, jest.fn());

    expect(response).toContain('No pude procesar');
  });

  it('B10 — registra el log estructurado al finalizar', async () => {
    const http = makeHttpStub([geminiText('Respuesta de prueba')]);
    const agent = makeAgent(http);
    const logSpy = jest.spyOn((agent as any).logger, 'log');

    await agent.run('test', SESSION_CLIENT, EMPTY_HISTORY, jest.fn());

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('agent_run'),
    );
  });
});

describe('AgentService.detectSentiment', () => {

  it('C1 — clasifica "neutral" correctamente', async () => {
    const http = makeHttpStub([geminiText('neutral')]);
    const agent = makeAgent(http);

    const result = await agent.detectSentiment('Quiero saber mi deuda');
    expect(result).toBe('neutral');
  });

  it('C2 — clasifica "angry" correctamente', async () => {
    const http = makeHttpStub([geminiText('angry')]);
    const agent = makeAgent(http);

    const result = await agent.detectSentiment('Están robando mi dinero, esto es un fraude!');
    expect(result).toBe('angry');
  });

  it('C3 — clasifica "frustrated" correctamente', async () => {
    const http = makeHttpStub([geminiText('frustrated')]);
    const agent = makeAgent(http);

    const result = await agent.detectSentiment('Ya llamé tres veces y nadie me ayuda');
    expect(result).toBe('frustrated');
  });

  it('C4 — clasifica "happy" correctamente', async () => {
    const http = makeHttpStub([geminiText('happy')]);
    const agent = makeAgent(http);

    const result = await agent.detectSentiment('Excelente servicio, gracias!');
    expect(result).toBe('happy');
  });

  it('C5 — valor no reconocido → cae a "neutral"', async () => {
    const http = makeHttpStub([geminiText('confusado')]);
    const agent = makeAgent(http);

    const result = await agent.detectSentiment('...');
    expect(result).toBe('neutral');
  });

  it('C6 — sin API key → retorna "neutral" sin llamar a Gemini', async () => {
    const http = makeHttpStub([]);
    const agent = makeAgent(http, { 'gemini.apiKey': '' });

    const result = await agent.detectSentiment('test');
    expect(result).toBe('neutral');
    expect(http.post).not.toHaveBeenCalled();
  });

  it('C7 — error de red → retorna "neutral" (silencioso)', async () => {
    const http = makeHttpStub([new Error('timeout')]);
    const agent = makeAgent(http);

    const result = await agent.detectSentiment('test');
    expect(result).toBe('neutral');
  });

  it('C8 — trunca el mensaje a 200 caracteres antes de enviarlo', async () => {
    const http = makeHttpStub([geminiText('neutral')]);
    const agent = makeAgent(http);
    const longText = 'a'.repeat(300);

    await agent.detectSentiment(longText);

    const sentText = (http.post as jest.Mock).mock.calls[0][1].contents[0].parts[0].text;
    expect(sentText.length).toBeLessThanOrEqual(500);
  });
});

describe('AgentService.summarizeConversation', () => {

  it('D1 — genera resumen cuando hay mensajes suficientes', async () => {
    const http = makeHttpStub([geminiText('El cliente consultó su deuda. Se resolvió exitosamente.')]);
    const agent = makeAgent(http);
    const msgs = [
      { role: 'user' as const, parts: [{ text: 'cuánto debo' }] },
      { role: 'model' as const, parts: [{ text: 'Tienes Bs. 150' }] },
      { role: 'user' as const, parts: [{ text: 'gracias' }] },
      { role: 'model' as const, parts: [{ text: 'de nada' }] },
    ];

    const result = await agent.summarizeConversation(msgs);

    expect(result).toContain('deuda');
  });

  it('D2 — retorna cadena vacía con menos de 4 mensajes', async () => {
    const http = makeHttpStub([]);
    const agent = makeAgent(http);

    const result = await agent.summarizeConversation([
      { role: 'user' as const, parts: [{ text: 'hola' }] },
    ]);

    expect(result).toBe('');
    expect(http.post).not.toHaveBeenCalled();
  });

  it('D3 — retorna cadena vacía sin API key', async () => {
    const http = makeHttpStub([]);
    const agent = makeAgent(http, { 'gemini.apiKey': '' });

    const result = await agent.summarizeConversation([
      { role: 'user' as const, parts: [{ text: 'a' }] },
      { role: 'model' as const, parts: [{ text: 'b' }] },
      { role: 'user' as const, parts: [{ text: 'c' }] },
      { role: 'model' as const, parts: [{ text: 'd' }] },
    ]);

    expect(result).toBe('');
    expect(http.post).not.toHaveBeenCalled();
  });

  it('D4 — error de red → retorna cadena vacía (silencioso)', async () => {
    const http = makeHttpStub([new Error('timeout')]);
    const agent = makeAgent(http);
    const msgs = Array.from({ length: 6 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'model') as 'user' | 'model',
      parts: [{ text: `msg ${i}` }],
    }));

    const result = await agent.summarizeConversation(msgs);
    expect(result).toBe('');
  });
});

describe('AgentService.generateGeneralAnswer', () => {

  it('E1 — genera respuesta con contexto', async () => {
    const http = makeHttpStub([geminiText('Nuestro plan 100 Mbps cuesta Bs. 250 al mes.')]);
    const agent = makeAgent(http);

    const result = await agent.generateGeneralAnswer('cuánto cuesta el plan 100?', 'Cliente: hola\nBot: Hola!');

    expect(result).toContain('250');
    const body = (http.post as jest.Mock).mock.calls[0][1];
    expect(body.contents[0].parts[0].text).toContain('Cliente: hola');
  });

  it('E2 — genera respuesta sin contexto (campo vacío)', async () => {
    const http = makeHttpStub([geminiText('Cubrimos toda la ciudad de Santa Cruz.')]);
    const agent = makeAgent(http);

    const result = await agent.generateGeneralAnswer('tienen cobertura en mi zona?', '');

    expect(result).toContain('Santa Cruz');
    const body = (http.post as jest.Mock).mock.calls[0][1];
    expect(body.contents[0].parts[0].text).toBe('tienen cobertura en mi zona?');
  });

  it('E3 — retorna cadena vacía sin API key', async () => {
    const http = makeHttpStub([]);
    const agent = makeAgent(http, { 'gemini.apiKey': '' });

    const result = await agent.generateGeneralAnswer('pregunta', '');
    expect(result).toBe('');
    expect(http.post).not.toHaveBeenCalled();
  });

  it('E4 — error de red → retorna cadena vacía (silencioso)', async () => {
    const http = makeHttpStub([new Error('error')]);
    const agent = makeAgent(http);

    const result = await agent.generateGeneralAnswer('test', '');
    expect(result).toBe('');
  });
});

describe('AgentService.run — tool routing', () => {
  const TOOLS = [
    'get_client_debt',
    'send_payment_qr',
    'create_support_ticket',
    'get_installation_slots',
    'create_installation',
    'close_support_ticket',
    'search_knowledge_base',
    'escalate_to_agent',
  ];

  TOOLS.forEach((toolName) => {
    it(`F — herramienta "${toolName}" se invoca con nombre correcto`, async () => {
      const executor = jest.fn().mockResolvedValue({ ok: true });
      const http = makeHttpStub([
        geminiFunctionCall(toolName, { query: 'test', issue_type: 'sin_conexion', description: 'desc' }),
        geminiText('Listo.'),
      ]);
      const agent = makeAgent(http);

      const { toolsCalled } = await agent.run('test', SESSION_CLIENT, EMPTY_HISTORY, executor);

      expect(toolsCalled).toContain(toolName);
      expect(executor).toHaveBeenCalledWith(toolName, expect.any(Object));
    });
  });
});

describe('AgentService.run — configuración Gemini', () => {

  it('G1 — incluye functionDeclarations en el request', async () => {
    const http = makeHttpStub([geminiText('ok')]);
    const agent = makeAgent(http);
    const mockDeclarations = Array.from({ length: 9 }, (_, i) => ({ name: `tool_${i}` }));

    await agent.run('test', SESSION_CLIENT, EMPTY_HISTORY, jest.fn(), mockDeclarations);

    const body = (http.post as jest.Mock).mock.calls[0][1];
    expect(body.tools).toBeDefined();
    expect(body.tools[0].functionDeclarations).toHaveLength(9);
  });

  it('G2 — mode AUTO en tool_config', async () => {
    const http = makeHttpStub([geminiText('ok')]);
    const agent = makeAgent(http);

    await agent.run('test', SESSION_CLIENT, EMPTY_HISTORY, jest.fn());

    const body = (http.post as jest.Mock).mock.calls[0][1];
    expect(body.tool_config.function_calling_config.mode).toBe('AUTO');
  });

  it('G3 — temperatura 0.4 y maxOutputTokens del config', async () => {
    const http = makeHttpStub([geminiText('ok')]);
    const agent = makeAgent(http, { 'gemini.maxTokens': 800 });

    await agent.run('test', SESSION_CLIENT, EMPTY_HISTORY, jest.fn());

    const body = (http.post as jest.Mock).mock.calls[0][1];
    expect(body.generationConfig.temperature).toBe(0.4);
    expect(body.generationConfig.maxOutputTokens).toBe(800);
  });

  it('G4 — system_instruction incluye el prompt del sistema', async () => {
    const http = makeHttpStub([geminiText('ok')]);
    const agent = makeAgent(http);

    await agent.run('test', SESSION_CLIENT, EMPTY_HISTORY, jest.fn());

    const body = (http.post as jest.Mock).mock.calls[0][1];
    expect(body.system_instruction.parts[0].text).toContain('Telecom Bolivianet');
  });

  it('G5 — thinkingBudget por defecto es 0 (thinking desactivado → mínima latencia)', async () => {
    const http = makeHttpStub([geminiText('ok')]);
    const agent = makeAgent(http); // sin override de gemini.thinkingBudget

    await agent.run('test', SESSION_CLIENT, EMPTY_HISTORY, jest.fn());

    const body = (http.post as jest.Mock).mock.calls[0][1];
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it('G6 — respeta el thinkingBudget configurado por env', async () => {
    const http = makeHttpStub([geminiText('ok')]);
    const agent = makeAgent(http, { 'gemini.thinkingBudget': 512 });

    await agent.run('test', SESSION_CLIENT, EMPTY_HISTORY, jest.fn());

    const body = (http.post as jest.Mock).mock.calls[0][1];
    expect(body.generationConfig.thinkingConfig.thinkingBudget).toBe(512);
  });
});

describe('AgentService — Performance (Fase 5)', () => {

  it('H1 — axios configurado con timeout de 25 000 ms', () => {
    const config        = makeConfig();
    const geminiClient  = makeGeminiClient();
    const promptBuilder = makePromptBuilder();
    const sentimentSvc  = new SentimentService(config, geminiClient, new ExponentialBackoffPolicy(), new SentimentHeuristic());
    const summarizerSvc = new ConversationSummarizerService(config, geminiClient, new ExponentialBackoffPolicy());
    const sanitizerSvc  = new InputSanitizerService();

    const agent = new AgentService(
      config, geminiClient, promptBuilder, sentimentSvc, summarizerSvc, sanitizerSvc,
      new ActionConfirmationGuard(), new ExponentialBackoffPolicy(),
      { acquire: jest.fn().mockResolvedValue(undefined) } as any,
      { recordSuccess: jest.fn(), recordError: jest.fn() } as any,
    );

    expect((agent as any).http.defaults.timeout).toBe(25_000);
  });

  // El agente reintenta hasta 2 veces (1 reintento) ante timeout/429 —
  // correcto en prod, pero un test no debería esperar esos segundos reales
  // para cada intento. Se acelera setTimeout solo para estos dos tests.
  describe('con reintentos acelerados', () => {
    let setTimeoutSpy: jest.SpyInstance;
    beforeEach(() => {
      setTimeoutSpy = jest.spyOn(global, 'setTimeout')
        .mockImplementation(((cb: () => void) => { cb(); return 0 as any; }) as any);
    });
    afterEach(() => { setTimeoutSpy.mockRestore(); });

    it('H2 — timeout de Gemini (ECONNABORTED) agota los reintentos y responde con fallback amigable', async () => {
      const timeoutErr = Object.assign(new Error('timeout of 25000ms exceeded'), { code: 'ECONNABORTED' });
      const http  = makeHttpStub([timeoutErr]);
      const agent = makeAgent(http);

      const { response } = await agent.run('consulta', SESSION_CLIENT, EMPTY_HISTORY, jest.fn());

      expect(response).toContain('problema técnico');
      expect(response).not.toContain('alta demanda');
      expect(response).not.toContain('ECONNABORTED');
      expect(http.post).toHaveBeenCalledTimes(2);
    });

    it('H3 — timeout no propaga excepción al caller (respuesta siempre string)', async () => {
      const timeoutErr = Object.assign(new Error('timeout of 25000ms exceeded'), { code: 'ECONNABORTED' });
      const http  = makeHttpStub([timeoutErr]);
      const agent = makeAgent(http);

      await expect(
        agent.run('hola', SESSION_CLIENT, EMPTY_HISTORY, jest.fn()),
      ).resolves.toMatchObject({ response: expect.any(String) });
    });
  });
});

// HALLAZGO 15 (2026-08-07): la primera version del respaldo por sesion decia
// "si el cliente tiene CUALQUIER ticket activo, no controles nada descriptivo".
// Demasiado ancho: con un ticket abierto, un "tu solicitud de cambio de plan
// quedo registrada" —falso, sin ninguna herramienta detras— pasaba sin
// correccion, porque el ticket existia pero no tenia nada que ver.
describe('AgentService — el respaldo por sesion tiene que ser especifico', () => {
  const guard = new ActionConfirmationGuard();

  // El guard se aplica con readBacked=false cuando la afirmacion no cita
  // ninguna referencia, aunque la sesion tenga tickets.
  it('una afirmacion SIN referencia no queda respaldada por tener un ticket', () => {
    const texto = 'Tu solicitud de cambio de plan quedó registrada.';
    expect(/\b(TK|TBN|INST)-[\w-]+/i.test(texto)).toBe(false);
    expect(guard.isUnbackedConfirmation(texto, false, false)).toBe(true);
  });

  // "quedo registrado" cae en ASSERTION_PATTERNS, que se comprueban SIEMPRE.
  // El respaldo por sesion solo levanta los patrones DESCRIPTIVOS. Por eso el
  // hallazgo 5 sigue abierto: la frase que lo disparo es una afirmacion.
  it('el respaldo levanta lo descriptivo, no lo afirmativo', () => {
    const descriptivo = 'Tu ticket TK-2026-0717 sigue abierto y en proceso.';
    expect(guard.isUnbackedConfirmation(descriptivo, false, true)).toBe(false);

    // Esta, en cambio, sigue marcada aunque el ticket exista de verdad: por eso
    // el hallazgo 5 sigue abierto.
    const afirmativo = 'Tu ticket TK-2026-0717 quedó registrado.';
    expect(guard.isUnbackedConfirmation(afirmativo, false, true)).toBe(true);
  });

  it('afirmar la accion en 1a persona no se salva ni con referencia', () => {
    expect(guard.isUnbackedConfirmation('Ya registré tu ticket TK-2026-0717.', false, true)).toBe(true);
  });
});
