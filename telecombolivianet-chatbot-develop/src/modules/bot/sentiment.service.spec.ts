import { SentimentService } from './sentiment.service';
import { SentimentHeuristic } from './sentiment/sentiment-heuristic';

function build() {
  const config = {
    get: jest.fn((k: string) => ({
      'gemini.apiKey':     'k',
      'gemini.lightModel': 'gemini-2.0-flash-lite',
    }[k])),
  };
  const geminiClient = {
    isUsingOAuth:   jest.fn().mockReturnValue(true),
    buildUrl:       jest.fn().mockReturnValue('https://fake/model:generateContent'),
    getAuthHeaders: jest.fn().mockResolvedValue({}),
  };
  const retry = { execute: jest.fn((fn: () => Promise<unknown>) => fn()) };

  const svc = new SentimentService(
    config as any, geminiClient as any, retry as any, new SentimentHeuristic(),
  );
  const post = jest.fn();
  (svc as any).http = { post };
  const warn = jest.spyOn((svc as any).logger, 'warn').mockImplementation(() => undefined);

  return { svc, post, warn };
}

const eventoDe = (warn: jest.SpyInstance) =>
  JSON.parse(warn.mock.calls.at(-1)![0] as string);

/** Mensaje ambiguo: la heurística devuelve null y obliga a consultar al LLM. */
const AMBIGUO = 'La verdad es que ya no sé qué pensar de este servicio que contraté';

describe('SentimentService.detect', () => {
  afterEach(() => jest.restoreAllMocks());

  it('la heurística resuelve los casos evidentes sin gastar una llamada', async () => {
    const { svc, post } = build();

    await expect(svc.detect('gracias')).resolves.toBe('neutral');
    await expect(svc.detect('esto es una basura, son unos ladrones')).resolves.toBe('angry');
    expect(post).not.toHaveBeenCalled();
  });

  it('un mensaje ambiguo sí consulta al LLM y acepta su etiqueta', async () => {
    const { svc, post } = build();
    post.mockResolvedValue({
      data: { candidates: [{ content: { parts: [{ text: 'frustrated' }] } }] },
    });

    await expect(svc.detect(AMBIGUO)).resolves.toBe('frustrated');
    expect(post).toHaveBeenCalledTimes(1);
  });

  // ── FASE B1 (2026-08-07) ──────────────────────────────────────────────────
  // Antes había un `catch { return 'neutral'; }` mudo, y 'neutral' es
  // indistinguible de "el cliente está tranquilo". Evidencia de producción:
  // 285 turnos neutral, 2 angry (explicables por la heurística local) y CERO
  // 'frustrated'/'happy' en dos semanas — etiquetas que solo puede producir el
  // LLM. Sin log, era imposible saber si la llamada funcionaba.
  describe('B1 — un fallo NUNCA puede ser silencioso', () => {
    it('si la llamada falla, deja log con modelo y status, y degrada a neutral', async () => {
      const { svc, post, warn } = build();
      post.mockRejectedValue({
        message: 'Request failed with status code 404',
        response: { status: 404, data: { error: { status: 'NOT_FOUND' } } },
      });

      await expect(svc.detect(AMBIGUO)).resolves.toBe('neutral');

      const evento = eventoDe(warn);
      expect(evento.event).toBe('sentiment_failed');
      expect(evento.model).toBe('gemini-2.0-flash-lite'); // permite identificar A5
      expect(evento.status).toBe(404);
      expect(evento.apiCode).toBe('NOT_FOUND');
    });

    it('una etiqueta inesperada del modelo también deja rastro', async () => {
      const { svc, post, warn } = build();
      post.mockResolvedValue({
        data: { candidates: [{ content: { parts: [{ text: 'muy enojadísimo' }] } }] },
      });

      await expect(svc.detect(AMBIGUO)).resolves.toBe('neutral');
      expect(eventoDe(warn).event).toBe('sentiment_unexpected_label');
    });

    it('un caso resuelto por heurística NO genera warn (no es un fallo)', async () => {
      const { svc, warn } = build();

      await svc.detect('ok');

      expect(warn).not.toHaveBeenCalled();
    });
  });
});
