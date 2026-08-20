import { InteractiveIdCodec } from '../intents/interactive-id.codec';
import { CloseSupportTicketTool } from './close-support-ticket.tool';
import { buildClientSession } from '../../../test/factories/session.factory';


describe('CloseSupportTicketTool', () => {
  const ticketRepo    = { closeTicket: jest.fn() };
  const sessionSvc    = { updateSession: jest.fn() };
  const adminNotifier = { notifyTicketClosed: jest.fn() };
  let tool: CloseSupportTicketTool;

  beforeEach(() => {
    jest.resetAllMocks();
    ticketRepo.closeTicket.mockResolvedValue({ ticketNumber: null });
    sessionSvc.updateSession.mockResolvedValue(undefined);
    adminNotifier.notifyTicketClosed.mockResolvedValue(undefined);
    tool = new CloseSupportTicketTool(
      ticketRepo as any,
      sessionSvc as any,
      adminNotifier as any,
      new InteractiveIdCodec(),
    );
  });


  it('devuelve closed=false si no hay ticketId en args ni en sesión', async () => {
    const session = buildClientSession({ activeTicketId: null });

    const result = await tool.execute({}, session) as any;

    expect(result.closed).toBe(false);
    expect(result.error).toContain('No se encontró');
    expect(ticketRepo.closeTicket).not.toHaveBeenCalled();
  });


  it('descarta ticket_id de args que no coincide con la sesión (UUID corrupto del LLM)', async () => {
    const session = buildClientSession({ activeTicketId: 'session-ticket' });

    const result = await tool.execute(
      { ticket_id: 'arg-ticket-001', resolution: 'Resuelto' },
      session,
    ) as any;

    expect(ticketRepo.closeTicket).toHaveBeenCalledWith('session-ticket', 'Resuelto');
    expect(result.closed).toBe(true);
    expect(result.ticketId).toBe('session-ticket');
  });

  it('usa ticket_id de args cuando la sesión no tiene ticket activo', async () => {
    const session = buildClientSession({ activeTicketId: null });

    const result = await tool.execute(
      { ticket_id: 'arg-ticket-001', resolution: 'Resuelto' },
      session,
    ) as any;

    expect(ticketRepo.closeTicket).toHaveBeenCalledWith('arg-ticket-001', 'Resuelto');
    expect(result.closed).toBe(true);
  });

  it('usa session.activeTicketId como fallback cuando no hay ticket_id en args', async () => {
    const session = buildClientSession({ activeTicketId: 'session-ticket-002' });

    await tool.execute({}, session);

    expect(ticketRepo.closeTicket).toHaveBeenCalledWith(
      'session-ticket-002',
      expect.any(String),
    );
  });

  it('usa resolución por defecto si no se provee el arg resolution', async () => {
    const session = buildClientSession({ activeTicketId: 'ticket-003' });

    await tool.execute({}, session);

    expect(ticketRepo.closeTicket).toHaveBeenCalledWith(
      'ticket-003',
      'Resuelto por el cliente via WhatsApp',
    );
  });


  it('limpia activeTicketId y registra pendingCsatTicketId en sesión', async () => {
    const session = buildClientSession({
      phoneNumber:   '59171000001',
      activeTicketId: 'ticket-004',
    });

    await tool.execute({}, session);

    expect(sessionSvc.updateSession).toHaveBeenCalledWith('59171000001', {
      activeTicketId:      null,
      pendingCsatTicketId: 'ticket-004',
      // FASE G4: marca de tiempo para poder caducar el CSAT pendiente.
      pendingCsatAt:       expect.any(Number),
    });
  });


  it('notifica al admin con notifyTicketClosed', async () => {
    const session = buildClientSession({
      phoneNumber: '59171000001',
      clientName:  'Juan Pérez',
      activeTicketId: 'ticket-005',
    });

    await tool.execute({}, session);

    expect(adminNotifier.notifyTicketClosed).toHaveBeenCalledWith({
      phoneNumber: '59171000001',
      clientName:  'Juan Pérez',
      ticketId:    'ticket-005',
    });
  });


  it('la respuesta incluye csatPending=true y pregunta de calificación', async () => {
    const session = buildClientSession({ activeTicketId: 'ticket-006' });

    const result = await tool.execute({}, session) as any;

    expect(result.csatPending).toBe(true);
    // La escala ya no se explica en el texto — la llevan las filas de la lista.
    // Lo que importa es que NO se le siga pidiendo al cliente escribir un número.
    expect(result.csatQuestion).toBeTruthy();
    expect(result.csatQuestion).not.toMatch(/1 al 5|escrib|responde con un n/i);
  });

  it('PASO 2B: devuelve ticketNumber legible cuando el backend lo trae', async () => {
    ticketRepo.closeTicket.mockResolvedValue({ ticketNumber: 'TK-2026-0055' });
    const session = buildClientSession({ activeTicketId: '9f2a1c3b-4d5e-6f70-8192-a3b4c5d6e7f8' });

    const result = await tool.execute({}, session) as any;

    expect(result.ticketNumber).toBe('TK-2026-0055');
  });

  it('PASO 2B: sin ticketNumber del backend, cae al fragmento corto del GUID', async () => {
    ticketRepo.closeTicket.mockResolvedValue({ ticketNumber: null });
    const session = buildClientSession({ activeTicketId: '9f2a1c3b-4d5e-6f70-8192-a3b4c5d6e7f8' });

    const result = await tool.execute({}, session) as any;

    expect(result.ticketNumber).toBe('TK-9F2A1C3B');
  });


  it('devuelve closed=false con error descriptivo cuando el repositorio falla', async () => {
    ticketRepo.closeTicket.mockRejectedValue(new Error('DB connection lost'));
    const session = buildClientSession({ activeTicketId: 'ticket-007' });

    const result = await tool.execute({}, session) as any;

    expect(result.closed).toBe(false);
    expect(result.error).toContain('DB connection lost');
  });


  it('getName devuelve "close_support_ticket"', () => {
    expect(tool.getName()).toBe('close_support_ticket');
  });

  it('requiresIdentification devuelve false', () => {
    expect(tool.requiresIdentification()).toBe(false);
  });

  // 2026-08-07: la nota se pedía en prosa y volvía como texto libre, así que
  // cualquier número del 1 al 5 en las 2 horas siguientes al cierre quedaba
  // registrado como calificación — incluido un "5" que contestaba otra cosa.
  describe('la calificación se pide con botones, no en prosa', () => {
    it('ofrece las cinco notas, cada una con su id inequívoco', async () => {
      const r: any = await tool.execute(
        { resolution: 'listo' },
        { phoneNumber: '59171000001', activeTicketId: 'tk-1' } as any,
      );

      const filas = r._list.sections[0].rows;
      expect(filas.map((f: any) => f.id)).toEqual([
        'csat:5', 'csat:4', 'csat:3', 'csat:2', 'csat:1',
      ]);
      expect(filas).toHaveLength(5);
    });

    it('si el cierre falla no se ofrece calificar nada', async () => {
      ticketRepo.closeTicket.mockRejectedValue(new Error('backend caído'));

      const r: any = await tool.execute(
        { resolution: 'listo' },
        { phoneNumber: '59171000001', activeTicketId: 'tk-1' } as any,
      );

      expect(r.closed).toBe(false);
      expect(r._list).toBeUndefined();
    });
  });

});
