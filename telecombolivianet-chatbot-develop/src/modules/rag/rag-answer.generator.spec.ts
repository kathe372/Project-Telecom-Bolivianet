import { RagAnswerGenerator } from './rag-answer.generator';
import { ChunkMatch } from './chunk-vector.repository';

const CHUNKS: ChunkMatch[] = [
  { id: 'c1', content: 'La instalación es gratuita en zonas con cobertura.', similarity: 0.9, documentTitle: 'FAQ' },
];

describe('RagAnswerGenerator', () => {
  const geminiClient = {
    buildUrl: jest.fn().mockReturnValue('http://gemini/generate'),
    getAuthHeaders: jest.fn().mockResolvedValue({}),
  };
  const retry = { execute: jest.fn((fn: () => Promise<unknown>) => fn()) };
  const config = {
    get: jest.fn((k: string) => ({
      'gemini.apiKey': 'key', 'gemini.chatModel': 'gemini-2.0-flash',
      'gemini.maxTokens': 512, 'gemini.temperature': 0.3,
    }[k])),
  };
  let gen: RagAnswerGenerator;
  let postMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    retry.execute.mockImplementation((fn: () => Promise<unknown>) => fn());
    gen = new RagAnswerGenerator(config as any, geminiClient as any, retry as any);
    postMock = jest.fn().mockResolvedValue({
      data: { candidates: [{ content: { parts: [{ text: 'Respuesta generada.' }] } }] },
    });
    (gen as any).http = { post: postMock };
  });

  const promptOf = () => postMock.mock.calls[0][1].contents[0].parts[0].text as string;

  // BUG-R2 + FASE 2.4: la firma ya no acepta contexto conversacional, así que
  // es imposible por construcción filtrar la conversación de un cliente a la
  // caché compartida. El prompt solo puede tener chunks + la pregunta.
  it('BUG-R2: el prompt se arma SOLO con los chunks y la pregunta', async () => {
    await gen.generate('¿costo de instalación?', CHUNKS);
    const prompt = promptOf();
    expect(prompt).toContain('base de conocimiento');
    expect(prompt).toContain('¿costo de instalación?');
    expect(prompt).not.toContain('Contexto de la conversación');
  });

  it('BUG-R2: dos clientes con la misma pregunta producen prompts idénticos', async () => {
    await gen.generate('¿costo de instalación?', CHUNKS);
    const primero = promptOf();
    postMock.mockClear();
    await gen.generate('¿costo de instalación?', CHUNKS);
    expect(postMock.mock.calls[0][1].contents[0].parts[0].text).toBe(primero);
  });

  it('devuelve el texto del candidato', async () => {
    const out = await gen.generate('q', CHUNKS);
    expect(out).toBe('Respuesta generada.');
  });

  it('respuesta vacía de Gemini → string vacío', async () => {
    postMock.mockResolvedValue({ data: { candidates: [{ content: { parts: [{}] } }] } });
    expect(await gen.generate('q', CHUNKS)).toBe('');
  });
});
