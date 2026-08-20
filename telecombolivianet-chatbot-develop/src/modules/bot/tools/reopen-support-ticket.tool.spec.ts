import { ReopenSupportTicketTool } from './reopen-support-ticket.tool';
import { buildClientSession } from '../../../test/factories/session.factory';


describe('ReopenSupportTicketTool', () => {
  const ticketRepo    = { getClientActiveTickets: jest.fn(), reopenTicket: jest.fn() };
  const sessionSvc    = { updateSession: jest.fn() };
  const adminNotifier = { notifyTicketCreated: jest.fn() };
  let tool: ReopenSupportTicketTool;

  beforeEach(() => {
    jest.resetAllMocks();
    ticketRepo.reopenTicket.mockResolvedValue({ ticketNumber: null });
    sessionSvc.updateSession.mockResolvedValue(undefined);
    adminNotifier.notifyTicketCreated.mockResolvedValue(undefined);
    tool = new ReopenSupportTicketTool(
      ticketRepo as any,
      sessionSvc as any,
      adminNotifier as any,
    );
  });


  it('reabre usando activeTicketId de la sesión cuando no hay ticket_id en args', async () => {
    const session = buildClientSession({ activeTicketId: 'session-ticket-001' });

    const result = await tool.execute(
      { description: 'El problema regresó' },
      session,
    ) as any;

    expect(ticketRepo.reopenTicket).toHaveBeenCalledWith(
      'session-ticket-001',
      'El problema regresó',
    );
    expect(result.reopened).toBe(true);
  });

  it('usa ticket_id de args cuando coincide con activeTicketId de sesión', async () => {
    const session = buildClientSession({ activeTicketId: 'session-ticket-001' });

    await tool.execute(
      { ticket_id: 'session-ticket-001', description: 'Falla de nuevo' },
      session,
    );

    expect(ticketRepo.reopenTicket).toHaveBeenCalledWith('session-ticket-001', 'Falla de nuevo');
  });

  // P2.2 (auditoría 2026-08): antes el ticket_id del modelo pisaba a la sesión
  // aunque no coincidieran — el mismo hueco que ya se había cerrado en
  // update_ticket/close_support_ticket. La sesión ahora es la fuente de
  // verdad ante un ticket_id corrompido/inventado por el modelo.
  it('P2.2 — la sesión gana cuando ticket_id de args NO coincide con activeTicketId de sesión', async () => {
    const session = buildClientSession({ activeTicketId: 'session-ticket-001' });

    await tool.execute(
      { ticket_id: 'arg-ticket-002', description: 'Falla de nuevo' },
      session,
    );

    expect(ticketRepo.reopenTicket).toHaveBeenCalledWith('session-ticket-001', 'Falla de nuevo');
  });


  it('busca ticket Resuelto cuando no hay ticketId disponible', async () => {
    const session = buildClientSession({ activeTicketId: null });
    ticketRepo.getClientActiveTickets.mockResolvedValue([
      { Id: 'resolved-001', Status: 'Resuelto' },
    ]);

    const result = await tool.execute(
      { description: 'Volvió a fallar' },
      session,
    ) as any;

    expect(ticketRepo.getClientActiveTickets).toHaveBeenCalledWith(session.clientId);
    expect(ticketRepo.reopenTicket).toHaveBeenCalledWith('resolved-001', 'Volvió a fallar');
    expect(result.reopened).toBe(true);
  });

  it('devuelve reopened=false con sugerencia cuando no hay ticket Resuelto', async () => {
    const session = buildClientSession({ activeTicketId: null });
    ticketRepo.getClientActiveTickets.mockResolvedValue([
      { Id: 'open-001', Status: 'Abierto' },
    ]);

    const result = await tool.execute(
      { description: 'Problema nuevo' },
      session,
    ) as any;

    expect(result.reopened).toBe(false);
    expect(result.message).toContain('nuevo ticket de soporte');
    expect(ticketRepo.reopenTicket).not.toHaveBeenCalled();
  });

  it('devuelve reopened=false cuando la lista de tickets está vacía', async () => {
    const session = buildClientSession({ activeTicketId: null });
    ticketRepo.getClientActiveTickets.mockResolvedValue([]);

    const result = await tool.execute({ description: 'Problema' }, session) as any;

    expect(result.reopened).toBe(false);
    expect(ticketRepo.reopenTicket).not.toHaveBeenCalled();
  });


  it('actualiza activeTicketId en sesión tras reabrir', async () => {
    const session = buildClientSession({
      phoneNumber:    '59171000001',
      activeTicketId: 'ticket-to-reopen',
    });

    await tool.execute({ description: 'Persiste' }, session);

    expect(sessionSvc.updateSession).toHaveBeenCalledWith(
      '59171000001',
      { activeTicketId: 'ticket-to-reopen' },
    );
  });

  it('notifica al admin con prioridad Alta al reabrir', async () => {
    const session = buildClientSession({
      phoneNumber:    '59171000001',
      clientName:     'Juan Pérez',
      activeTicketId: 'ticket-alta',
    });

    await tool.execute({ description: 'Regresó el problema' }, session);

    expect(adminNotifier.notifyTicketCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        phoneNumber: '59171000001',
        clientName:  'Juan Pérez',
        ticketId:    'ticket-alta',
        priority:    'Alta',
      }),
    );
  });

  it('la respuesta incluye mensaje de prioridad alta', async () => {
    const session = buildClientSession({ activeTicketId: 'ticket-001' });

    const result = await tool.execute({ description: 'Problema' }, session) as any;

    expect(result.message).toContain('prioridad alta');
  });

  it('PASO 2B: devuelve ticketNumber legible cuando el backend lo trae', async () => {
    ticketRepo.reopenTicket.mockResolvedValue({ ticketNumber: 'TK-2026-0088' });
    const session = buildClientSession({ activeTicketId: '9f2a1c3b-4d5e-6f70-8192-a3b4c5d6e7f8' });

    const result = await tool.execute({ description: 'Volvió a fallar' }, session) as any;

    expect(result.ticketNumber).toBe('TK-2026-0088');
  });


  it('usa descripción por defecto si no se provee el arg description', async () => {
    const session = buildClientSession({ activeTicketId: 'ticket-001' });

    await tool.execute({}, session);

    expect(ticketRepo.reopenTicket).toHaveBeenCalledWith(
      'ticket-001',
      'El cliente reporta que el problema persiste',
    );
  });


  it('devuelve reopened=false con error cuando reopenTicket falla', async () => {
    ticketRepo.reopenTicket.mockRejectedValue(new Error('API error'));
    const session = buildClientSession({ activeTicketId: 'ticket-001' });

    const result = await tool.execute({ description: 'Problema' }, session) as any;

    expect(result.reopened).toBe(false);
    expect(result.error).toContain('API error');
  });

  it('devuelve reopened=false con error cuando getClientActiveTickets falla', async () => {
    ticketRepo.getClientActiveTickets.mockRejectedValue(new Error('Network timeout'));
    const session = buildClientSession({ activeTicketId: null });

    const result = await tool.execute({ description: 'Problema' }, session) as any;

    expect(result.reopened).toBe(false);
    expect(result.error).toContain('Network timeout');
  });


  it('getName devuelve "reopen_support_ticket"', () => {
    expect(tool.getName()).toBe('reopen_support_ticket');
  });

  it('requiresIdentification devuelve true', () => {
    expect(tool.requiresIdentification()).toBe(true);
  });
});
