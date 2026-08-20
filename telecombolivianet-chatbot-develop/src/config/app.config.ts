import { registerAs } from '@nestjs/config';

export function validateConfig(config: Record<string, unknown>): Record<string, unknown> {
  const required = [
    'META_APP_SECRET',
    'META_PHONE_NUMBER_ID',
    'META_ACCESS_TOKEN',
  ];
  const missing = required.filter(k => !config[k]);
  if (missing.length > 0) {
    throw new Error(
      `Variables de entorno faltantes al iniciar el chatbot: ${missing.join(', ')}. ` +
      `La aplicación no puede iniciarse sin estas variables.`,
    );
  }

  // FASE 0.4: STORAGE_TYPE=supabase sin credenciales no falla al arrancar —
  // falla mucho después, al primer envío de media, con una URL relativa
  // (`/storage/v1/object/...`) y un error de axios que MediaStorageService
  // degrada a texto. Resultado: el QR de pago nunca llega como imagen y nada
  // lo avisa. Se detecta acá, al arranque, igual que las credenciales de Meta.
  if (config['STORAGE_TYPE'] === 'supabase') {
    const faltantes = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'].filter(k => !config[k]);
    if (faltantes.length > 0) {
      throw new Error(
        `STORAGE_TYPE=supabase pero faltan: ${faltantes.join(', ')}. ` +
        `Sin estas variables el envío de imágenes (QR de pago) falla en silencio. ` +
        `Configuralas, o usá STORAGE_TYPE=local con STORAGE_PUBLIC_URL.`,
      );
    }
  }

  return config;
}

function parseIntSafe(value: string | undefined, fallback: number): number {
  const n = parseInt(value ?? '', 10);
  return isNaN(n) ? fallback : n;
}

function parseFloatSafe(value: string | undefined, fallback: number): number {
  const n = parseFloat(value ?? '');
  return isNaN(n) ? fallback : n;
}

export const appConfig = registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseIntSafe(process.env.PORT, 3001),
  name: process.env.APP_NAME || 'bolivianet-chatbot',
}));

export const databaseConfig = registerAs('database', () => {
  const password = process.env.DB_PASSWORD;
  if (!password && process.env.NODE_ENV === 'production') {
    throw new Error('DB_PASSWORD es requerido en producción.');
  }
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseIntSafe(process.env.DB_PORT, 5432),
    username: process.env.DB_USERNAME || 'chatbot_user',
    password: password || 'chatbot_secret',
    database: process.env.DB_DATABASE || 'chatbot_db',
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    logging: process.env.DB_LOGGING === 'true',
  };
});

export const redisConfig = registerAs('redis', () => {
  const password = process.env.REDIS_PASSWORD;
  if (!password && process.env.NODE_ENV === 'production') {
    throw new Error('REDIS_PASSWORD es requerido en producción.');
  }
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseIntSafe(process.env.REDIS_PORT, 6379),
    password: password || undefined,
    db: parseIntSafe(process.env.REDIS_DB, 0),
    sessionTtl: parseIntSafe(process.env.REDIS_SESSION_TTL, 86400),
  };
});

export const sistemaConfig = registerAs('sistema', () => ({
  apiUrl: process.env.SISTEMA_API_URL || 'http://localhost:5000',
  botEmail: process.env.SISTEMA_BOT_EMAIL || 'bot@telecombolivianet.bo',
  botPassword: process.env.SISTEMA_BOT_PASSWORD || '',
  jwtRefreshMarginMinutes: parseIntSafe(process.env.SISTEMA_JWT_REFRESH_MARGIN_MINUTES, 60),
  botStaticToken: process.env.SISTEMA_BOT_STATIC_TOKEN || '',
}));

export const metaConfig = registerAs('meta', () => ({
  verifyToken: process.env.META_VERIFY_TOKEN || '',
  appSecret: process.env.META_APP_SECRET || '',
  accessToken: process.env.META_ACCESS_TOKEN || '',
  phoneNumberId: process.env.META_PHONE_NUMBER_ID || '',
  wabaId: process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID || '',
  apiVersion: process.env.META_API_VERSION || 'v18.0',
  apiUrl: process.env.META_API_URL || 'https://graph.facebook.com',
}));

export const geminiConfig = registerAs('gemini', () => ({
  apiKey:             process.env.GEMINI_API_KEY || '',
  // A5 (2026-08-07): comprobado contra Vertex AI con las credenciales reales
  // del proyecto: en el endpoint 'global' NINGUN modelo de la familia 2.0
  // existe (gemini-2.0-flash, -flash-001, -flash-lite y -flash-lite-001 dan
  // 404 NOT_FOUND). Solo responden 200 los 2.5. Los defaults viejos apuntaban
  // a 2.0 y por eso el resumidor y el sentimiento estuvieron caidos semanas.
  chatModel:          process.env.GEMINI_CHAT_MODEL  || 'gemini-2.5-flash',
  lightModel:         process.env.GEMINI_LIGHT_MODEL || 'gemini-2.5-flash-lite',
  embedModel:         process.env.GEMINI_EMBED_MODEL || 'text-embedding-004',
  maxTokens:          parseIntSafe(process.env.GEMINI_MAX_TOKENS, 512),
  temperature:        parseFloatSafe(process.env.GEMINI_TEMPERATURE, 0.3),
  // Presupuesto de "thinking" de los modelos 2.5 (tokens). 0 = desactivado
  // (mínima latencia, recomendado para atención al cliente); -1 = dinámico
  // (default de Google, puede añadir 10-20 s por turno). Subir solo si se
  // observa pérdida de calidad en turnos con muchas herramientas.
  thinkingBudget:     parseIntSafe(process.env.GEMINI_THINKING_BUDGET, 0),
  serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '',
  // P0.1 (auditoría 2026-08): 'global' en vez de una región fija — Google
  // recomienda el endpoint global para cuentas pay-as-you-go con Dynamic
  // Shared Quota: enruta cada pedido a la región con capacidad disponible en
  // ese momento, en vez de pelear por el pool de una sola región (causa real
  // de los 429 RESOURCE_EXHAUSTED vistos en prod con us-central1 fijo).
  location:           process.env.GEMINI_LOCATION || 'global',
  // P3.1 (auditoría 2026-08): tope de solicitudes/minuto a Gemini en TODO el
  // bot (todos los usuarios juntos) — sin esto, N conversaciones simultáneas
  // pueden sumar una ráfaga total que agota la cuota compartida de Google
  // aunque cada usuario individualmente mande "pocos mensajes". Valor
  // conservador por default — ajustar según cuota real observada.
  rateLimitPerMinute: parseIntSafe(process.env.GEMINI_RATE_LIMIT_PER_MINUTE, 30),
}));

export const ragConfig = registerAs('rag', () => ({
  similarityThreshold: parseFloatSafe(process.env.RAG_SIMILARITY_THRESHOLD, 0.75),
  // ATENCIÓN — nombre heredado y engañoso: NO participa en el pipeline de RAG.
  // Su único consumidor es SessionService.MAX_MESSAGES (ventana de historial
  // que se guarda en Redis y se le manda a Gemini). Cuenta mensajes de AMBOS
  // lados, así que 20 ≈ 10 turnos. Bajarlo hace que el modelo pierda el hilo
  // en los flujos largos (instalación = 7 pasos) y obliga a compensar con más
  // campos de sesión e instrucciones en el prompt. No bajar de 20 sin medir.
  contextMessages:     parseIntSafe(process.env.RAG_CONTEXT_MESSAGES, 20),
  maxChunks:           parseIntSafe(process.env.RAG_MAX_CHUNKS, 6),
  // Mas alto que similarityThreshold a proposito: arrancar un procedimiento
  // secuestra la conversacion, y ante la duda conviene no hacerlo.
  procedureEntryThreshold: parseFloatSafe(process.env.PROCEDURE_ENTRY_THRESHOLD, 0.55),

  cacheEnabled:     process.env.RAG_CACHE_ENABLED !== 'false',
  cacheSimilarity:  parseFloatSafe(process.env.RAG_CACHE_SIMILARITY, 0.92),
  cacheTtlDefaultH: parseIntSafe(process.env.RAG_CACHE_TTL_DEFAULT_H, 24),
  cacheTtlPricingH: parseIntSafe(process.env.RAG_CACHE_TTL_PRICING_H, 6),
  cacheTtlStaticH:  parseIntSafe(process.env.RAG_CACHE_TTL_STATIC_H, 168),
}));

export const storageConfig = registerAs('storage', () => ({
  type: process.env.STORAGE_TYPE || 'local',
  localPath: process.env.STORAGE_LOCAL_PATH || './uploads',
  publicUrl: process.env.STORAGE_PUBLIC_URL || '',
  supabase: {
    url:    (process.env.SUPABASE_URL    || '').replace(/\/$/, ''),
    key:     process.env.SUPABASE_ANON_KEY || '',
    bucket:  process.env.SUPABASE_STORAGE_BUCKET || 'chatbot-uploads',
  },
  minio: {
    endpoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseIntSafe(process.env.MINIO_PORT, 9000),
    useSsl: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || '',
    secretKey: process.env.MINIO_SECRET_KEY || '',
    bucket: process.env.MINIO_BUCKET || 'chatbot-comprobantes',
  },
}));

export const botConfig = registerAs('bot', () => ({
  installationDaysAhead: parseIntSafe(process.env.BOT_INSTALLATION_DAYS_AHEAD, 7),
  // BUG-03: 2.5s agrupaba mal el tecleo palabra-por-palabra (fragmentos >2.5s →
  // turnos múltiples → QR duplicado). 4s reduce la fragmentación del tecleo humano.
  debounceWindowMs: parseIntSafe(process.env.DEBOUNCE_WINDOW_MS, 4_000),
  // PASO 7 (2026-08-02): 8s generaba falsos positivos frecuentes (18.5% de
  // los turnos reales en producción superaban el umbral, mediana real 2.4s).
  // Subido a 30s mientras se instrumenta la causa real de la cola de latencia
  // — decisión explícita del usuario, no basada en el dato de producción (el
  // máximo observado hasta ahora fue 24.5s, así que este umbral no dispara
  // con el tráfico visto hasta hoy).
  nudgeAfterMs: parseIntSafe(process.env.BOT_NUDGE_AFTER_MS, 30_000),
  // 2026-08-05: ClientIdentificationHandler cachea la identidad (cliente o
  // prospecto) del teléfono en sesión y por diseño no vuelve a consultar el
  // backend mientras la sesión de Redis siga viva (hasta 24h de TTL) — así
  // que si un admin cambia el teléfono de un cliente en el panel, cualquier
  // sesión activa de ese número puede seguir "siendo" la identidad vieja
  // hasta por 24h. Pasado este umbral desde la última verificación, se
  // re-consulta el backend aunque la sesión no haya expirado.
  identityReverifyMinutes: parseIntSafe(process.env.BOT_IDENTITY_REVERIFY_MINUTES, 120),
}));

export const rateLimitConfig = registerAs('rateLimit', () => ({
  windowSeconds: parseIntSafe(process.env.RATE_LIMIT_WINDOW_SECONDS, 60),
  maxRequests:   parseIntSafe(process.env.RATE_LIMIT_MAX_REQUESTS, 20),
}));

