import {
  validateConfig, geminiConfig, ragConfig, botConfig,
  appConfig, databaseConfig, redisConfig, sistemaConfig,
  metaConfig, storageConfig, rateLimitConfig,
} from './app.config';

describe('validateConfig — variables requeridas', () => {
  const OK = { META_APP_SECRET: 's', META_PHONE_NUMBER_ID: 'p', META_ACCESS_TOKEN: 't' };

  it('pasa cuando están todas las requeridas', () => {
    expect(validateConfig({ ...OK })).toEqual(expect.objectContaining(OK));
  });

  it('lanza listando las que faltan', () => {
    expect(() => validateConfig({ META_APP_SECRET: 's' }))
      .toThrow(/META_PHONE_NUMBER_ID.*META_ACCESS_TOKEN|META_ACCESS_TOKEN/);
  });

  // FASE 0.4: sin esto, STORAGE_TYPE=supabase mal configurado arranca bien y
  // recién falla al primer QR, degradando a texto sin que nadie se entere.
  it('STORAGE_TYPE=supabase sin credenciales lanza al arrancar', () => {
    expect(() => validateConfig({ ...OK, STORAGE_TYPE: 'supabase' }))
      .toThrow(/SUPABASE_URL.*SUPABASE_ANON_KEY/);
    expect(() => validateConfig({ ...OK, STORAGE_TYPE: 'supabase', SUPABASE_URL: 'https://x.supabase.co' }))
      .toThrow(/SUPABASE_ANON_KEY/);
  });

  it('STORAGE_TYPE=supabase con credenciales pasa', () => {
    expect(() => validateConfig({
      ...OK, STORAGE_TYPE: 'supabase',
      SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k',
    })).not.toThrow();
  });

  it('STORAGE_TYPE=local no exige credenciales de Supabase', () => {
    expect(() => validateConfig({ ...OK, STORAGE_TYPE: 'local' })).not.toThrow();
    expect(() => validateConfig({ ...OK })).not.toThrow();
  });
});

describe('config factories — defaults', () => {
  const OLD = { ...process.env };
  afterEach(() => { process.env = { ...OLD }; });

  // A5 (2026-08-07): los defaults eran de la familia 2.0, que NO existe en el
  // endpoint global de Vertex AI de este proyecto (404 NOT_FOUND, comprobado
  // con las credenciales reales contra los 6 nombres candidatos). Ese default
  // muerto tuvo el resumidor y el detector de sentimiento caidos semanas.
  it('geminiConfig usa modelos 2.5 por defecto (los 2.0 dan 404 en Vertex)', () => {
    delete process.env.GEMINI_LIGHT_MODEL;
    delete process.env.GEMINI_CHAT_MODEL;
    const cfg = geminiConfig();
    expect(cfg.lightModel).toBe('gemini-2.5-flash-lite');
    expect(cfg.chatModel).toBe('gemini-2.5-flash');
    expect(cfg.lightModel).not.toMatch(/gemini-2\.0/);
    expect(cfg.chatModel).not.toMatch(/gemini-2\.0/);
  });

  it('ragConfig usa umbral y maxChunks por defecto ante env inválido', () => {
    process.env.RAG_SIMILARITY_THRESHOLD = 'no-es-numero';
    delete process.env.RAG_MAX_CHUNKS;
    const cfg = ragConfig();
    expect(cfg.similarityThreshold).toBe(0.75); // parseFloatSafe fallback
    // FASE D2 (2026-08-07): 3 -> 6. Con 20 chunks en la base, 13 mencionan
    // "router" y solo 3 "comodato": traer 3 dejaba fuera al chunk especifico.
    expect(cfg.maxChunks).toBe(6);
  });

  // FASE 0.3: RAG_CONTEXT_MESSAGES no es del RAG — es la ventana de historial
  // de SessionService (MAX_MESSAGES). Estaba en 5 en .env (≈2 turnos), por
  // debajo de lo que necesita el flujo de instalación de 7 pasos, mientras
  // .env.example ya documentaba 20. Este test fija el default para que una
  // futura edición del .env no lo vuelva a bajar sin que nadie se entere.
  it('ragConfig.contextMessages: default 20 y nunca por debajo de 20 en los .env versionados', () => {
    delete process.env.RAG_CONTEXT_MESSAGES;
    expect(ragConfig().contextMessages).toBe(20);

    process.env.RAG_CONTEXT_MESSAGES = 'no-es-numero';
    expect(ragConfig().contextMessages).toBe(20); // parseIntSafe fallback

    const fs   = require('fs');
    const path = require('path');
    const root = path.resolve(__dirname, '..', '..');
    for (const archivo of ['.env', '.env.test', '.env.example']) {
      const ruta = path.join(root, archivo);
      if (!fs.existsSync(ruta)) continue;
      const match = fs.readFileSync(ruta, 'utf-8')
        .match(/^RAG_CONTEXT_MESSAGES=(\d+)/m);
      if (!match) continue;
      expect({ archivo, valor: Number(match[1]) })
        .toEqual({ archivo, valor: expect.any(Number) });
      expect(Number(match[1])).toBeGreaterThanOrEqual(20);
    }
  });

  it('botConfig usa nudge y debounce por defecto', () => {
    delete process.env.BOT_NUDGE_AFTER_MS;
    delete process.env.DEBOUNCE_WINDOW_MS;
    const cfg = botConfig();
    expect(cfg.nudgeAfterMs).toBe(30000); // PASO 7: subido de 8000 a 30000
    expect(cfg.debounceWindowMs).toBe(4000); // BUG-03: subido de 2500 a 4000
  });

  it('geminiConfig: thinkingBudget por defecto 0 (thinking desactivado)', () => {
    delete process.env.GEMINI_THINKING_BUDGET;
    expect(geminiConfig().thinkingBudget).toBe(0);
    process.env.GEMINI_THINKING_BUDGET = '512';
    expect(geminiConfig().thinkingBudget).toBe(512);
  });

  it('appConfig usa nombre y puerto por defecto', () => {
    delete process.env.PORT; delete process.env.APP_NAME;
    const cfg = appConfig();
    expect(cfg.port).toBe(3001);
    expect(cfg.name).toBe('bolivianet-chatbot');
  });

  it('databaseConfig/redisConfig usan defaults fuera de producción', () => {
    delete process.env.DB_HOST; delete process.env.DB_PASSWORD;
    delete process.env.REDIS_HOST; delete process.env.REDIS_PASSWORD;
    expect(databaseConfig().host).toBe('localhost');
    expect(databaseConfig().port).toBe(5432);
    expect(redisConfig().port).toBe(6379);
    expect(redisConfig().sessionTtl).toBe(86400);
  });

  it('sistemaConfig/metaConfig exponen sus defaults', () => {
    delete process.env.SISTEMA_API_URL; delete process.env.META_API_VERSION;
    expect(sistemaConfig().apiUrl).toBe('http://localhost:5000');
    expect(metaConfig().apiVersion).toBe('v18.0');
    expect(metaConfig().apiUrl).toBe('https://graph.facebook.com');
  });

  it('storageConfig/rateLimitConfig exponen sus defaults', () => {
    delete process.env.STORAGE_TYPE; delete process.env.RATE_LIMIT_MAX_REQUESTS;
    expect(storageConfig().type).toBe('local');
    expect(storageConfig().supabase.bucket).toBe('chatbot-uploads');
    expect(rateLimitConfig().windowSeconds).toBe(60);
    expect(rateLimitConfig().maxRequests).toBe(20);
  });
});
