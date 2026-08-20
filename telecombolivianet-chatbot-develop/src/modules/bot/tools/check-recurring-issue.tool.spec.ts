import { CheckRecurringIssueTool } from './check-recurring-issue.tool';
import { buildClientSession } from '../../../test/factories/session.factory';

describe('CheckRecurringIssueTool (PASO 16 Fase A)', () => {
  const ticketRepo = { getRecentTicketCount: jest.fn() };
  const sessionSvc = { updateSession: jest.fn() };
  let tool: CheckRecurringIssueTool;

  beforeEach(() => {
    jest.resetAllMocks();
    sessionSvc.updateSession.mockResolvedValue(undefined);
    tool = new CheckRecurringIssueTool(ticketRepo as any, sessionSvc as any);
  });

  it('recentCount=0 → recurrent:false', async () => {
    ticketRepo.getRecentTicketCount.mockResolvedValue(0);
    const session = buildClientSession();

    const result = await tool.execute({ issue_type: 'sin_conexion' }, session) as any;

    expect(result.recurrent).toBe(false);
    expect(result.recentCount).toBe(0);
  });

  it('recentCount=1 → recurrent:true (la segunda vez ya cuenta, no la tercera)', async () => {
    ticketRepo.getRecentTicketCount.mockResolvedValue(1);
    const session = buildClientSession();

    const result = await tool.execute({ issue_type: 'sin_conexion' }, session) as any;

    expect(result.recurrent).toBe(true);
    expect(result.recentCount).toBe(1);
  });

  it('mapea issue_type al Type correcto antes de consultar (sin_conexion → SoporteTecnico)', async () => {
    ticketRepo.getRecentTicketCount.mockResolvedValue(0);
    const session = buildClientSession({ clientId: 'C-1' });

    await tool.execute({ issue_type: 'sin_senal_tv' }, session);

    expect(ticketRepo.getRecentTicketCount).toHaveBeenCalledWith('C-1', 'TvCable');
  });

  it('cachea el resultado en la sesión', async () => {
    ticketRepo.getRecentTicketCount.mockResolvedValue(1);
    const session = buildClientSession({ phoneNumber: '59171000001' });

    await tool.execute({ issue_type: 'sin_conexion' }, session);

    expect(sessionSvc.updateSession).toHaveBeenCalledWith('59171000001', {
      recentTicketCheck: { type: 'SoporteTecnico', recurrent: true, recentCount: 1 },
    });
  });

  it('si ya hay un chequeo cacheado del MISMO tipo en la sesión, no repite la consulta', async () => {
    const session = buildClientSession({
      recentTicketCheck: { type: 'SoporteTecnico', recurrent: true, recentCount: 2 },
    } as any);

    const result = await tool.execute({ issue_type: 'velocidad_lenta' }, session) as any;

    expect(ticketRepo.getRecentTicketCount).not.toHaveBeenCalled();
    expect(result).toEqual({
      recurrent: true, recentCount: 2, cached: true,
      // FASE D1: la instruccion viaja tambien por el camino cacheado.
      siguiente_paso_obligatorio: expect.stringContaining('create_support_ticket'),
    });
  });

  it('un chequeo cacheado de OTRO tipo SÍ repite la consulta', async () => {
    ticketRepo.getRecentTicketCount.mockResolvedValue(0);
    const session = buildClientSession({
      recentTicketCheck: { type: 'TvCable', recurrent: true, recentCount: 2 },
    } as any);

    const result = await tool.execute({ issue_type: 'sin_conexion' }, session) as any;

    expect(ticketRepo.getRecentTicketCount).toHaveBeenCalled();
    expect(result.recurrent).toBe(false);
  });

  it('issue_type desconocido → fallback a sin_conexion (SoporteTecnico)', async () => {
    ticketRepo.getRecentTicketCount.mockResolvedValue(0);
    const session = buildClientSession({ clientId: 'C-1' });

    await tool.execute({ issue_type: 'tipo_inexistente' }, session);

    expect(ticketRepo.getRecentTicketCount).toHaveBeenCalledWith('C-1', 'SoporteTecnico');
  });

  it('getName devuelve "check_recurring_issue"', () => {
    expect(tool.getName()).toBe('check_recurring_issue');
  });

  it('requiresIdentification devuelve true', () => {
    expect(tool.requiresIdentification()).toBe(true);
  });

  it('isMutating devuelve false', () => {
    expect(tool.isMutating()).toBe(false);
  });

  // FASE D1 (2026-08-07): cuatro reproducciones de cuatro en la sesion de
  // pruebas. "Mi internet esta lento" -> check_recurring_issue -> 960
  // caracteres de pasos INVENTADOS, con chunk_id en NULL. En una respuesta
  // llego a recomendar speedtest.net, un sitio de terceros que no aparece en
  // ningun documento. La informacion SI estaba: los chunks 4, 5 y 6 de SOPORTE
  // TECNICO responden exactamente eso.
  //
  // El prompt de sistema ya lo ordenaba y no alcanzaba. El modelo obedece mucho
  // mejor una instruccion que llega DENTRO del resultado de la tool que acaba
  // de llamar: es inmediata y local.
  describe('D1 — el resultado ordena consultar la base', () => {
    it('un problema nuevo obliga a llamar search_knowledge_base', async () => {
      ticketRepo.getRecentTicketCount.mockResolvedValue(0);

      const r = await tool.execute({ issue_type: 'lentitud' }, buildClientSession()) as any;

      expect(r.recurrent).toBe(false);
      expect(r.siguiente_paso_obligatorio).toMatch(/search_knowledge_base/);
      expect(r.siguiente_paso_obligatorio).toMatch(/PROHIBIDO/);
      // NO debe prohibir speedtest: el chunk 9 de SOPORTE TECNICO lo recomienda.
      // Medido contra la base de produccion el 2026-08-07.
      expect(r.siguiente_paso_obligatorio).not.toMatch(/speedtest/i);
    });

    it('un problema recurrente manda al ticket, no a la base', async () => {
      ticketRepo.getRecentTicketCount.mockResolvedValue(2);

      const r = await tool.execute({ issue_type: 'lentitud' }, buildClientSession()) as any;

      expect(r.recurrent).toBe(true);
      expect(r.siguiente_paso_obligatorio).toMatch(/create_support_ticket/);
      expect(r.siguiente_paso_obligatorio).toMatch(/visita t[eé]cnica/i);
    });

    // Si la instruccion solo viajara en la primera llamada, el segundo turno
    // sobre el mismo problema volveria a inventar pasos.
    it('el camino cacheado tambien la lleva', async () => {
      const session = buildClientSession({
        recentTicketCheck: { type: 'SoporteTecnico', recurrent: false, recentCount: 0 },
      } as any);

      const r = await tool.execute({ issue_type: 'sin_conexion' }, session) as any;

      expect(r.cached).toBe(true);
      expect(r.siguiente_paso_obligatorio).toMatch(/search_knowledge_base/);
      expect(ticketRepo.getRecentTicketCount).not.toHaveBeenCalled();
    });
  });

});
