import { ConversationSummarizerService } from './conversation-summarizer.service';
import { GeminiContent } from '../session/session.service';

const msg = (n: number): GeminiContent[] =>
  Array.from({ length: n }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'model') as 'user' | 'model',
    parts: [{ text: `mensaje ${i}` }],
  }));

function build(overrides: { apiKey?: string; oauth?: boolean } = {}) {
  const config = {
    get: jest.fn((k: string) => ({
      'gemini.apiKey':     overrides.apiKey ?? 'k',
      'gemini.chatModel':  'gemini-2.5-flash',
      'gemini.lightModel': 'gemini-2.0-flash-lite',
    }[k])),
  };
  const geminiClient = {
    isUsingOAuth:   jest.fn().mockReturnValue(overrides.oauth ?? false),
    buildUrl:       jest.fn().mockReturnValue('https://fake/model:generateContent'),
    getAuthHeaders: jest.fn().mockResolvedValue({}),
  };
  const retry = { execute: jest.fn((fn: () => Promise<unknown>) => fn()) };

  const svc = new ConversationSummarizerService(config as any, geminiClient as any, retry as any);
  const post = jest.fn();
  (svc as any).http = { post };
  const warn = jest.spyOn((svc as any).logger, 'warn').mockImplementation(() => undefined);
  jest.spyOn((svc as any).logger, 'debug').mockImplementation(() => undefined);

  return { svc, post, warn };
}

const eventoDe = (warn: jest.SpyInstance) =>
  JSON.parse(warn.mock.calls.at(-1)![0] as string);

describe('ConversationSummarizerService.summarize', () => {
  afterEach(() => jest.restoreAllMocks());

  it('resume correctamente cuando Gemini responde', async () => {
    const { svc, post } = build();
    post.mockResolvedValue({
      data: { candidates: [{ content: { parts: [{ text: '  El cliente pidió su deuda.  ' }] } }] },
    });

    await expect(svc.summarize(msg(6))).resolves.toBe('El cliente pidió su deuda.');
  });

  // ── FASE B1 (2026-08-07) ──────────────────────────────────────────────────
  // Este bloque es la razón de ser del cambio. Antes había un
  // `catch { return ''; }` mudo: el llamador leía el '' como "no había nada que
  // resumir" y seguía. En producción se midió 1 resumen exitoso de 58 intentos
  // durante semanas, y cada escalación llegaba al agente humano sin contexto
  // (hasSummary:false) sin una sola excepción en los logs.
  describe('B1 — un fallo NUNCA puede ser silencioso', () => {
    it('si la llamada a Gemini falla, deja un log con modelo, status y causa', async () => {
      const { svc, post, warn } = build();
      post.mockRejectedValue({
        message: 'Request failed with status code 404',
        response: { status: 404, data: { error: { status: 'NOT_FOUND' } } },
      });

      await expect(svc.summarize(msg(6))).resolves.toBe('');

      const evento = eventoDe(warn);
      expect(evento.event).toBe('summarize_failed');
      expect(evento.model).toBe('gemini-2.0-flash-lite'); // permite identificar A5
      expect(evento.status).toBe(404);
      expect(evento.apiCode).toBe('NOT_FOUND');
    });

    it('si Gemini responde 200 pero vacío, también deja rastro', async () => {
      const { svc, post, warn } = build();
      post.mockResolvedValue({
        data: { candidates: [{ content: { parts: [{}] }, finishReason: 'SAFETY' }] },
      });

      await expect(svc.summarize(msg(6))).resolves.toBe('');

      const evento = eventoDe(warn);
      expect(evento.event).toBe('summarize_empty');
      expect(evento.finishReason).toBe('SAFETY');
    });

    it('sin credenciales avisa, en vez de devolver vacío en silencio', async () => {
      const { svc, warn } = build({ apiKey: '', oauth: false });

      await expect(svc.summarize(msg(6))).resolves.toBe('');
      expect(eventoDe(warn).event).toBe('summarize_skipped');
    });
  });

  it('conversación demasiado corta se omite SIN warn (no es un fallo)', async () => {
    const { svc, post, warn } = build();

    await expect(svc.summarize(msg(3))).resolves.toBe('');

    expect(post).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled(); // distinguible de un error real
  });
});
