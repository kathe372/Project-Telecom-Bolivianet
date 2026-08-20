import { SearchKnowledgeBaseTool } from './search-knowledge-base.tool';
import { buildSession, buildClientSession } from '../../../test/factories/session.factory';


describe('SearchKnowledgeBaseTool', () => {
  const ragSvc = { query: jest.fn() };
  let tool: SearchKnowledgeBaseTool;

  beforeEach(() => {
    jest.resetAllMocks();
    tool = new SearchKnowledgeBaseTool(ragSvc as any);
  });


  it('devuelve found=false si la query está vacía', async () => {
    const result = await tool.execute({ query: '' }, buildSession()) as any;

    expect(result.found).toBe(false);
    expect(result.error).toContain('Se requiere una consulta');
    expect(ragSvc.query).not.toHaveBeenCalled();
  });

  it('devuelve found=false si la query es solo espacios', async () => {
    const result = await tool.execute({ query: '   ' }, buildSession()) as any;

    expect(result.found).toBe(false);
    expect(ragSvc.query).not.toHaveBeenCalled();
  });


  it('devuelve found=true con answer, chunkId y similarity cuando el RAG encuentra resultado', async () => {
    ragSvc.query.mockResolvedValue({
      found:      true,
      answer:     'Para restablecer el router, mantén presionado el botón RESET 10 segundos.',
      chunkId:    'chunk-001',
      similarity: 0.87,
    });

    const result = await tool.execute(
      { query: '¿Cómo reinicio el router?' },
      buildClientSession(),
    ) as any;

    expect(result.found).toBe(true);
    expect(result.answer).toContain('RESET');
    expect(result.chunkId).toBe('chunk-001');
    expect(result.similarity).toBe(0.87);
  });

  // FASE 2.1: la búsqueda va SOLO con la pregunta que redactó el modelo.
  // Antes se le concatenaba la conversación entera, lo que diluía el vector
  // de búsqueda y hacía caer chunks relevantes por debajo del umbral.
  it('llama a ragSvc.query con la query y SIN contexto de conversación', async () => {
    ragSvc.query.mockResolvedValue({ found: false });
    const session = buildClientSession({ phoneNumber: '59171000001' });

    await tool.execute({ query: 'velocidad mínima garantizada' }, session);

    expect(ragSvc.query).toHaveBeenCalledWith('velocidad mínima garantizada', '');
  });

  it('no depende de la sesión para buscar: la misma query da la misma llamada', async () => {
    ragSvc.query.mockResolvedValue({ found: false });

    await tool.execute({ query: '¿cómo reinicio el router?' }, buildSession());
    await tool.execute(
      { query: '¿cómo reinicio el router?' },
      buildClientSession({ phoneNumber: '59171000002' }),
    );

    const llamadas = ragSvc.query.mock.calls;
    expect(llamadas).toHaveLength(2);
    expect(llamadas[0]).toEqual(llamadas[1]);
  });


  it('devuelve found=false con mensaje explicativo cuando el RAG no encuentra respuesta', async () => {
    ragSvc.query.mockResolvedValue({ found: false });

    const result = await tool.execute(
      { query: 'precio del servicio de TV por cable en Oruro' },
      buildSession(),
    ) as any;

    expect(result.found).toBe(false);
    expect(result.message).toContain('No encontré información');
  });


  it('devuelve found=false con error cuando ragSvc lanza excepción', async () => {
    ragSvc.query.mockRejectedValue(new Error('pgvector timeout'));

    const result = await tool.execute(
      { query: '¿Tienen cobertura en El Alto?' },
      buildSession(),
    ) as any;

    expect(result.found).toBe(false);
    expect(result.error).toContain('pgvector timeout');
  });

  // FASE 2.1: antes esta ruta existía porque la tool leía la sesión de Redis
  // antes de buscar. Ya no lo hace, así que Redis caído deja de ser un motivo
  // para que falle una consulta a la base de conocimiento.
  it('un fallo de Redis ya no puede romper la búsqueda (no toca la sesión)', async () => {
    ragSvc.query.mockResolvedValue({ found: true, answer: 'Bs. 149/mes', chunkId: 'c1' });

    const result = await tool.execute(
      { query: '¿Cuánto cuesta el plan Fibra?' },
      buildSession(),
    ) as any;

    expect(result.found).toBe(true);
    expect(result.answer).toBe('Bs. 149/mes');
  });


  it('getName devuelve "search_knowledge_base"', () => {
    expect(tool.getName()).toBe('search_knowledge_base');
  });

  it('requiresIdentification devuelve false', () => {
    expect(tool.requiresIdentification()).toBe(false);
  });
});
