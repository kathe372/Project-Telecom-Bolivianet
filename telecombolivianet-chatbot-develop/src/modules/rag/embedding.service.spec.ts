import { EmbeddingService } from './embedding.service';

describe('EmbeddingService', () => {
  const geminiClient = { embedText: jest.fn() };
  const retry = { execute: jest.fn((fn: () => Promise<unknown>) => fn()) };
  const config = { get: jest.fn().mockReturnValue('text-embedding-004') };
  let service: EmbeddingService;

  beforeEach(() => {
    jest.clearAllMocks();
    retry.execute.mockImplementation((fn: () => Promise<unknown>) => fn());
    service = new EmbeddingService(config as any, geminiClient as any, retry as any);
  });

  it('embed: usa el modelo configurado y el taskType', async () => {
    geminiClient.embedText.mockResolvedValue([0.1, 0.2]);
    const out = await service.embed('hola', 'RETRIEVAL_QUERY');

    expect(geminiClient.embedText).toHaveBeenCalledWith('hola', 'text-embedding-004', 'RETRIEVAL_QUERY');
    expect(out).toEqual([0.1, 0.2]);
  });

  it('embed: pasa por la política de reintentos (label gemini-embed)', async () => {
    geminiClient.embedText.mockResolvedValue([0.5]);
    await service.embed('x');
    expect(retry.execute).toHaveBeenCalledWith(expect.any(Function), { label: 'gemini-embed' });
  });

  it('embed: taskType por defecto RETRIEVAL_DOCUMENT', async () => {
    geminiClient.embedText.mockResolvedValue([1]);
    await service.embed('doc');
    expect(geminiClient.embedText).toHaveBeenCalledWith('doc', 'text-embedding-004', 'RETRIEVAL_DOCUMENT');
  });

  it('embed: propaga el error si el embedding falla', async () => {
    geminiClient.embedText.mockRejectedValue(new Error('quota'));
    await expect(service.embed('x')).rejects.toThrow('quota');
  });

  it('embedForIndexing: usa backoff largo (label gemini-embed-index)', async () => {
    geminiClient.embedText.mockResolvedValue([0.9]);
    await service.embedForIndexing('chunk');
    expect(retry.execute).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ label: 'gemini-embed-index', baseMs: 35_000 }),
    );
    expect(geminiClient.embedText).toHaveBeenCalledWith('chunk', 'text-embedding-004', 'RETRIEVAL_DOCUMENT');
  });
});
