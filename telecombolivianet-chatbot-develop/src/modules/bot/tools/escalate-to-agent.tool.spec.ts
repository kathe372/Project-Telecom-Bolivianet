import { EscalateToAgentTool } from './escalate-to-agent.tool';
import { buildClientSession } from '../../../test/factories/session.factory';


describe('EscalateToAgentTool', () => {
  let tool: EscalateToAgentTool;

  beforeEach(() => {
    tool = new EscalateToAgentTool();
  });


  it('humanAvailable=true → deferred:false (escalamiento en vivo)', async () => {
    const session = buildClientSession({ humanAvailable: true });
    const result  = await tool.execute({ reason: 'Cliente lo solicitó' }, session) as any;

    expect(result.queued).toBe(true);
    expect(result.deferred).toBe(false);
  });

  it('humanAvailable=true → mensaje de transferencia inmediata', async () => {
    const session = buildClientSession({ humanAvailable: true });
    const result  = await tool.execute({}, session) as any;

    expect(result.message).toContain('Solicitud de transferencia');
  });


  it('humanAvailable=false → deferred:true (escalamiento diferido)', async () => {
    const session = buildClientSession({ humanAvailable: false });
    const result  = await tool.execute({ reason: 'Sin solución disponible' }, session) as any;

    expect(result.queued).toBe(true);
    expect(result.deferred).toBe(true);
  });

  it('humanAvailable=false → mensaje con aviso de horario', async () => {
    const session = buildClientSession({ humanAvailable: false });
    const result  = await tool.execute({}, session) as any;

    expect(result.message).toContain('horario de atención');
  });

  it('humanAvailable=undefined (no asignado) → deferred:true por defecto seguro', async () => {
    const session = buildClientSession({ humanAvailable: undefined });
    const result  = await tool.execute({}, session) as any;

    expect(result.deferred).toBe(true);
  });


  it('usa el reason proporcionado en los args', async () => {
    const session = buildClientSession({ humanAvailable: true });
    const result  = await tool.execute({ reason: 'Problema complejo' }, session) as any;

    expect(result.reason).toBe('Problema complejo');
  });

  it('usa motivo por defecto si no se provee reason', async () => {
    const session = buildClientSession({ humanAvailable: true });
    const result  = await tool.execute({}, session) as any;

    expect(result.reason).toBeTruthy();
    expect(typeof result.reason).toBe('string');
  });


  it('getName devuelve "escalate_to_agent"', () => {
    expect(tool.getName()).toBe('escalate_to_agent');
  });

  it('getDeclaration incluye los 4 casos de uso en la description', () => {
    const decl = tool.getDeclaration() as any;
    expect(decl.description).toContain('EXPLÍCITAMENTE');
    expect(decl.description).toContain('enojado');
    expect(decl.description).toContain('unverified');
    // 2026-08-07: la frase 'en lugar de inventar' se reemplazo por la condicion
    // que faltaba — escalar por no saber exige haber consultado la base primero.
    expect(decl.description).toContain('search_knowledge_base');
  });

  it('requiresIdentification devuelve false', () => {
    expect(tool.requiresIdentification()).toBe(false);
  });
});
