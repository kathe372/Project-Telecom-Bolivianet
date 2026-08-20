import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';


export interface SessionMessage {
  role: 'user' | 'bot' | 'admin';
  content: string;
  timestamp: number;
}

export interface GeminiContent {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

export interface SessionData {
  phoneNumber: string;
  clientId: string | null;
  clientName: string | null;
  clientStatus: string | null;
  planId: string | null;
  planName: string | null;
  /** 2026-08-07: el backend ya lo devuelve (PlanSpeedMbps) y se descartaba.
   *  Hace falta para calcular el umbral de la prueba de velocidad. */
  planSpeedMbps?: number | null;
  /** Bloque del procedimiento en curso. Caduca — ver PROCEDIMIENTO_TTL_MS. */
  procedimientoActual?: { clave: string; at: number } | null;
  totalDebt: number;
  tbnCode: string | null;

  activeTicketId: string | null;
  activeInstallationId: string | null;
  pendingAction: string | null;
  pendingTechIssue: string | null;
  pendingCsatTicketId: string | null;
  /** FASE G4: cuándo se dejó pendiente el CSAT, para poder caducarlo. */
  pendingCsatAt?: number | null;

  isEscalated: boolean;

  lastSentiment: 'neutral' | 'frustrated' | 'angry' | 'happy';
  angryCount: number;

  lastLocation: { lat: number; lng: number; name?: string; address?: string } | null;
  locationCapturedAt?: number | null;
  locationSource?: 'whatsapp_gps' | 'google_maps' | 'nominatim' | null;

  /** Datos del prospecto para agendar instalación, guardados apenas los da
   *  (save_prospect_data) — no dependen de la ventana de historial de
   *  mensajes, igual que lastLocation. Se limpian al agendar con éxito. */
  prospectName?: string | null;
  prospectIdentityCard?: string | null;
  prospectAddress?: string | null;
  /** Contacto alterno del prospecto (no el número de WhatsApp desde el que
   *  escribe, que ya se manda como ProspectPhone automáticamente) — para que
   *  el técnico pueda contactarlo si el WhatsApp principal no responde el día
   *  de la instalación. Mismo tratamiento que el resto de datos del prospecto. */
  prospectBackupPhone?: string | null;

  /** Auditoría 2026-08: UUID real del plan, decodificado server-side (no por
   *  el LLM) apenas el cliente toca un botón de get_installation_plans — ver
   *  InteractiveIdCodec.decode() en bot-orchestrator.service.ts. El modelo
   *  recibe el id embebido en una frase de texto varios turnos antes de
   *  llamar create_installation, y repetidamente lo "recuerda mal" e inventa
   *  un slug parecido al nombre del plan (ej. "plan-cobre-123") en vez de
   *  copiarlo literal. Guardado acá, es la fuente de verdad — mismo criterio
   *  que prospectName/prospectAddress. Se limpia al agendar con éxito. */
  selectedPlanId?: string | null;

  /** true apenas get_available_plans o get_installation_plans le mostraron
   *  los planes al cliente en esta conversación — evita volver a preguntar
   *  "¿te gustaría ver los planes?" si comparte su ubicación DESPUÉS de
   *  haber pedido los planes (ya mostró la intención, no hace falta
   *  reconfirmarla). Se limpia al agendar con éxito, igual que los datos
   *  del prospecto. */
  plansShown?: boolean;

  pendingImageId: string | null;
  pendingImageCaption: string | null;

  /** MEJORA-1D: resumen de la conversación anterior (cliente que vuelve tras expirar TTL).
   *  Opcionales (como humanAvailable) para no romper literales existentes; DEFAULT_SESSION los provee. */
  previousSummary?: string | null;
  previousSummaryAt?: number | null;

  messages: SessionMessage[];

  humanAvailable?: boolean;

  /** PASO 16 Fase A: cache del resultado de check_recurring_issue dentro de la
   *  conversación — evita repetir la consulta al backend en cada turno. */
  recentTicketCheck?: { type: string; recurrent: boolean; recentCount: number } | null;

  /** 2026-08-05: timestamp (Date.now()) de la última vez que se identificó
   *  este teléfono contra el backend (cliente encontrado o marcado prospecto).
   *  ClientIdentificationHandler solo confía en clientId/prospect cacheados
   *  mientras esto sea reciente — pasado BOT_IDENTITY_REVERIFY_MINUTES, se
   *  vuelve a consultar aunque la sesión de Redis siga viva (hasta 24h de TTL).
   *  Antes: si un admin cambiaba el teléfono de un cliente, cualquier sesión
   *  activa seguía con la identidad vieja hasta que la sesión expirara sola. */
  identityVerifiedAt?: number | null;

  /** 2026-08-05: PhoneMain no es único — dos clientes distintos (dos CIs,
   *  ej. familiares) pueden compartir el mismo teléfono de contacto. Cuando
   *  eso pasa, ClientIdentificationHandler NO elige uno solo: deja clientId
   *  en null y guarda acá las opciones para que el bot le pregunte al
   *  usuario con cuál cuenta continuar (ver AccountChoiceService). Se limpia
   *  apenas el usuario elige una. */
  ambiguousClients?: {
    clientId: string; clientName: string; clientStatus: string;
    planId: string; planName: string; totalDebt: number; tbnCode: string;
    planSpeedMbps?: number | null;
  }[] | null;

  /**
   * FASE G2 (2026-08-07): estado REAL del patrón de confirmación en dos pasos.
   *
   * Hasta ahora ese patrón era solo una instrucción del prompt: la herramienta
   * agendaba/cancelaba con solo recibir `confirmado: true`, sin que nada
   * verificara que antes hubo un resumen ni que el cliente dijo que sí.
   *
   * Medido en producción el 2026-08-07: el modelo mandó
   * `cancel_installation {motivo, confirmado: true}` en el MISMO turno en que
   * el cliente dio el motivo. La instalación se canceló de verdad sin que
   * nadie confirmara nada, pese a que el sistema lo prohíbe en tres lugares
   * distintos del prompt.
   *
   * Se guarda al emitir el paso 1 (`pending: true`) y el paso 2 lo exige. El
   * orquestador lo borra al final de cualquier turno que no lo haya emitido ni
   * consumido, así que solo vale para el turno inmediatamente siguiente — que
   * es justo la semántica del patrón.
   */
  pendingConfirmation?: {
    tool: string;
    argsHash: string;
    at: number;
  } | null;
}

const DEFAULT_SESSION: Omit<SessionData, 'phoneNumber'> = {
  clientId: null,
  clientName: null,
  clientStatus: null,
  planId: null,
  planName: null,
  planSpeedMbps: null,
  procedimientoActual: null,
  totalDebt: 0,
  tbnCode: null,
  activeTicketId: null,
  activeInstallationId: null,
  pendingAction: null,
  pendingTechIssue: null,
  pendingCsatTicketId: null,
  pendingCsatAt: null,
  isEscalated: false,
  lastSentiment: 'neutral',
  angryCount: 0,
  lastLocation: null,
  locationCapturedAt: null,
  locationSource: null,
  prospectName: null,
  prospectIdentityCard: null,
  prospectAddress: null,
  prospectBackupPhone: null,
  selectedPlanId: null,
  plansShown: false,
  pendingImageId: null,
  pendingImageCaption: null,
  previousSummary: null,
  previousSummaryAt: null,
  messages: [],
  identityVerifiedAt: null,
  ambiguousClients: null,
  pendingConfirmation: null,
};

@Injectable()
export class SessionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionService.name);
  private redis: Redis;
  private readonly TTL: number;
  private readonly MAX_MESSAGES: number;
  private readonly PREFIX = 'session:';
  private readonly LOCK_PREFIX = 'session:lock:';
  private readonly LOCK_TTL_MS = 5000;

  private static readonly LUA_ACQUIRE = `
    return redis.call('SET', KEYS[1], ARGV[1], 'NX', 'PX', ARGV[2])
  `;

  private static readonly LUA_RELEASE = `
    if redis.call('GET', KEYS[1]) == ARGV[1] then
      return redis.call('DEL', KEYS[1])
    else
      return 0
    end
  `;

  private static readonly LUA_PATCH = `
    local raw = redis.call('GET', KEYS[1])
    local ttl = redis.call('TTL', KEYS[1])
    local sess
    if raw then
      sess = cjson.decode(raw)
    else
      sess = cjson.decode(ARGV[2])
    end
    local patch = cjson.decode(ARGV[1])
    for k, v in pairs(patch) do
      sess[k] = v
    end
    local encoded = cjson.encode(sess)
    if ttl == -1 then
      return redis.call('SET', KEYS[1], encoded)
    elseif ttl == -2 then
      return redis.call('SET', KEYS[1], encoded, 'EX', tonumber(ARGV[3]))
    else
      return redis.call('SET', KEYS[1], encoded, 'EX', ttl)
    end
  `;

  constructor(private readonly config: ConfigService) {
    this.TTL          = config.get<number>('redis.sessionTtl') ?? 86400;
    this.MAX_MESSAGES = config.get<number>('rag.contextMessages') ?? 20;
  }

  onModuleInit() {
    this.redis = new Redis({
      host:     this.config.get<string>('redis.host'),
      port:     this.config.get<number>('redis.port'),
      password: this.config.get<string>('redis.password') || undefined,
      db:       this.config.get<number>('redis.db'),
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });

    this.redis.on('connect', () => this.logger.log('Redis conectado'));
    this.redis.on('error',   (err) => this.logger.error('Redis error', err.message));
  }

  onModuleDestroy() { this.redis?.disconnect(); }

  private key(phone: string): string { return `${this.PREFIX}${phone}`; }
  private lockKey(phone: string): string { return `${this.LOCK_PREFIX}${phone}`; }

  async withLock<T>(phone: string, fn: () => Promise<T>): Promise<T> {
    const token = randomUUID();
    const lockK = this.lockKey(phone);
    const maxRetries = 10;
    const retryMs = 50;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const acquired = await this.redis.eval(
        SessionService.LUA_ACQUIRE,
        1,
        lockK,
        token,
        String(this.LOCK_TTL_MS),
      );

      if (acquired === 'OK') {
        try {
          return await fn();
        } finally {
          await this.redis.eval(SessionService.LUA_RELEASE, 1, lockK, token);
        }
      }

      await new Promise(r => setTimeout(r, retryMs));
    }

    throw new Error(`No se pudo adquirir lock de sesión para ${phone} tras ${maxRetries} intentos (${maxRetries * retryMs}ms). Redis puede estar sobrecargado.`);
  }

  async getSession(phone: string): Promise<SessionData> {
    const raw = await this.redis.get(this.key(phone));
    if (!raw) return { phoneNumber: phone, ...DEFAULT_SESSION, messages: [] };
    try {
      const parsed = JSON.parse(raw) as SessionData;
      // Defensa: el script Lua de patchSession (cjson) puede convertir un
      // array vacío [] en objeto {} — normalizar para que push() nunca falle.
      if (!Array.isArray(parsed.messages)) parsed.messages = [];
      return { ...DEFAULT_SESSION, phoneNumber: phone, ...parsed };
    } catch {
      this.logger.warn(`Sesión corrupta para ${phone} — reiniciando`);
      return { phoneNumber: phone, ...DEFAULT_SESSION, messages: [] };
    }
  }

  async saveSession(session: SessionData): Promise<void> {
    await this.redis.setex(this.key(session.phoneNumber), this.TTL, JSON.stringify(session));
  }

  async updateSession(phone: string, partial: Partial<SessionData>): Promise<SessionData> {
    return this.withLock(phone, async () => {
      const session = await this.getSession(phone);
      const updated = { ...session, ...partial };
      await this.saveSession(updated);
      return updated;
    });
  }

  async patchSession(phone: string, patch: Partial<SessionData>): Promise<void> {
    const defaultJson = JSON.stringify({ phoneNumber: phone, ...DEFAULT_SESSION });
    await this.redis.eval(
      SessionService.LUA_PATCH,
      1,
      this.key(phone),
      JSON.stringify(patch),
      defaultJson,
      String(this.TTL),
    );
  }

  async addMessage(phone: string, role: 'user' | 'bot' | 'admin', content: string): Promise<void> {
    await this.withLock(phone, async () => {
      const session = await this.getSession(phone);
      session.messages.push({ role, content, timestamp: Date.now() });
      if (session.messages.length > this.MAX_MESSAGES) {
        session.messages = session.messages.slice(-this.MAX_MESSAGES);
      }
      await this.saveSession(session);
    });
  }

  async getGeminiHistory(phone: string): Promise<GeminiContent[]> {
    const session = await this.getSession(phone);
    return session.messages.map((m): GeminiContent => ({
      role:  m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }));
  }

  async getContextText(phone: string): Promise<string> {
    const session = await this.getSession(phone);
    return session.messages
      .map(m => `${m.role === 'user' ? 'Cliente' : 'Bot'}: ${m.content}`)
      .join('\n');
  }

  async setClientData(phone: string, data: {
    clientId: string; clientName: string; clientStatus: string;
    planId: string; planName: string; totalDebt: number; tbnCode: string;
    planSpeedMbps?: number | null;
    identityVerifiedAt?: number;
  }): Promise<void> {
    await this.updateSession(phone, data);
  }

  async escalate(phone: string): Promise<void> {
    await this.updateSession(phone, { isEscalated: true });
  }

  async deescalate(phone: string): Promise<void> {
    await this.updateSession(phone, {
      isEscalated: false,
      angryCount: 0,
    });
  }

  async updateSentiment(
    phone: string,
    sentiment: 'neutral' | 'frustrated' | 'angry' | 'happy',
  ): Promise<void> {
    await this.withLock(phone, async () => {
      const session    = await this.getSession(phone);
      const angryCount = sentiment === 'angry' ? (session.angryCount ?? 0) + 1 : 0;
      await this.saveSession({ ...session, lastSentiment: sentiment, angryCount });
    });
  }

  async setPendingAction(phone: string, action: string | null): Promise<void> {
    await this.updateSession(phone, { pendingAction: action });
  }

  async deleteSession(phone: string): Promise<void> {
    await this.redis.del(this.key(phone));
  }

  /**
   * BUG-03: dedup atómico de acciones con efecto secundario (p.ej. envío del QR
   * de pago). `SET once:<key> 1 EX <ttl> NX` devuelve 'OK' solo la primera vez
   * dentro de la ventana; en llamadas repetidas devuelve null → false. Evita que
   * dos turnos casi simultáneos (mensajes fragmentados) reenvíen lo mismo.
   */
  async claimOnce(key: string, ttlSeconds: number): Promise<boolean> {
    const res = await this.redis.set(`once:${key}`, '1', 'EX', ttlSeconds, 'NX');
    return res === 'OK';
  }

}
