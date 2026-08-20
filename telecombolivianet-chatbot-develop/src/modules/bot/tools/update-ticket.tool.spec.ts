import { UpdateTicketTool } from './update-ticket.tool';
import { buildClientSession } from '../../../test/factories/session.factory';


describe('UpdateTicketTool', () => {
  const ticketRepo = { updateTicket: jest.fn() };
  const sessionSvc = { patchSession: jest.fn() };
  let tool: UpdateTicketTool;

  beforeEach(() => {
    jest.resetAllMocks();
    ticketRepo.updateTicket.mockResolvedValue({ ticketNumber: null });
    sessionSvc.patchSession.mockResolvedValue(undefined);
    tool = new UpdateTicketTool(ticketRepo as any, sessionSvc as any);
  });


  it('devuelve updated=false si no hay ticketId disponible', async () => {
    const session = buildClientSession({
      activeTicketId:      null,
      pendingCsatTicketId: null,
      pendingCsatAt:       null,   // FASE G4
    });

    const result = await tool.execute(
      { description: 'El cable está cortado' },
      session,
    ) as any;

    expect(result.updated).toBe(false);
    expect(result.error).toContain('No hay ticket activo');
    expect(ticketRepo.updateTicket).not.toHaveBeenCalled();
  });

  it('devuelve updated=false si ni description ni root_cause se proveen', async () => {
    const session = buildClientSession({ activeTicketId: 'ticket-001' });

    const result = await tool.execute({}, session) as any;

    expect(result.updated).toBe(false);
    expect(result.error).toContain('description o root_cause');
  });


  it('descarta ticket_id de args que no coincide con la sesión (UUID corrupto del LLM)', async () => {
    const session = buildClientSession({
      activeTicketId:      'active-001',
      pendingCsatTicketId: 'csat-001',
    });

    await tool.execute({ ticket_id: 'arg-ticket', description: 'Más info' }, session);

    expect(ticketRepo.updateTicket).toHaveBeenCalledWith(
      'csat-001',
      expect.any(String),
      undefined,
    );
  });

  it('acepta ticket_id de args cuando coincide con la sesión', async () => {
    const session = buildClientSession({
      activeTicketId:      'active-001',
      pendingCsatTicketId: 'csat-001',
    });

    await tool.execute({ ticket_id: 'active-001', description: 'Más info' }, session);

    expect(ticketRepo.updateTicket).toHaveBeenCalledWith(
      'active-001',
      expect.any(String),
      undefined,
    );
  });

  it('usa ticket_id de args cuando la sesión no tiene tickets', async () => {
    const session = buildClientSession({});

    await tool.execute({ ticket_id: 'arg-ticket', description: 'Más info' }, session);

    expect(ticketRepo.updateTicket).toHaveBeenCalledWith(
      'arg-ticket',
      expect.any(String),
      undefined,
    );
  });

  it('usa pendingCsatTicketId cuando no hay ticket_id ni activeTicketId', async () => {
    const session = buildClientSession({
      activeTicketId:      null,
      pendingCsatTicketId: 'csat-001',
    });

    await tool.execute({ root_cause: 'CSAT: 5/5 — Excelente atención' }, session);

    expect(ticketRepo.updateTicket).toHaveBeenCalledWith(
      'csat-001',
      '',
      'CSAT: 5/5 — Excelente atención',
    );
  });

  it('usa activeTicketId cuando no hay ni ticket_id ni pendingCsatTicketId', async () => {
    const session = buildClientSession({
      activeTicketId:      'active-001',
      pendingCsatTicketId: null,
      pendingCsatAt:       null,   // FASE G4
    });

    await tool.execute({ description: 'El problema persiste' }, session);

    expect(ticketRepo.updateTicket).toHaveBeenCalledWith(
      'active-001',
      'El problema persiste',
      undefined,
    );
  });


  it('trunca description a 990 caracteres', async () => {
    const longText = 'A'.repeat(1500);
    const session  = buildClientSession({ activeTicketId: 'ticket-001' });

    await tool.execute({ description: longText }, session);

    const [, calledDesc] = (ticketRepo.updateTicket as jest.Mock).mock.calls[0];
    expect(calledDesc.length).toBe(990);
  });

  it('trunca root_cause a 990 caracteres', async () => {
    const longText = 'B'.repeat(1500);
    const session  = buildClientSession({ activeTicketId: 'ticket-001' });

    await tool.execute({ root_cause: longText }, session);

    const [, , calledRootCause] = (ticketRepo.updateTicket as jest.Mock).mock.calls[0];
    expect(calledRootCause?.length).toBe(990);
  });


  it('limpia pendingCsatTicketId en sesión tras actualizar', async () => {
    const session = buildClientSession({
      phoneNumber:         '59171000001',
      activeTicketId:      null,
      pendingCsatTicketId: 'csat-002',
    });

    await tool.execute({ root_cause: 'CSAT: 4/5 — Bien' }, session);

    expect(sessionSvc.patchSession).toHaveBeenCalledWith('59171000001', {
      pendingCsatTicketId: null,
      pendingCsatAt:       null,   // FASE G4
    });
  });

  it('no llama a patchSession si no hay CSAT pendiente', async () => {
    const session = buildClientSession({
      activeTicketId:      'ticket-001',
      pendingCsatTicketId: null,
      pendingCsatAt:       null,   // FASE G4
    });

    await tool.execute({ description: 'Info adicional' }, session);

    expect(sessionSvc.patchSession).not.toHaveBeenCalled();
  });


  it('devuelve updated=true con ticketId y mensaje de confirmación', async () => {
    const session = buildClientSession({ activeTicketId: 'ticket-001' });

    const result = await tool.execute({ description: 'Información adicional' }, session) as any;

    expect(result.updated).toBe(true);
    expect(result.ticketId).toBe('ticket-001');
    expect(result.message).toContain('correctamente');
  });

  it('PASO 2B: devuelve ticketNumber legible cuando el backend lo trae', async () => {
    ticketRepo.updateTicket.mockResolvedValue({ ticketNumber: 'TK-2026-0033' });
    const session = buildClientSession({ activeTicketId: '9f2a1c3b-4d5e-6f70-8192-a3b4c5d6e7f8' });

    const result = await tool.execute({ description: 'Info adicional' }, session) as any;

    expect(result.ticketNumber).toBe('TK-2026-0033');
  });


  it('devuelve updated=false con error cuando el repositorio falla', async () => {
    ticketRepo.updateTicket.mockRejectedValue(new Error('Constraint violation'));
    const session = buildClientSession({ activeTicketId: 'ticket-001' });

    const result = await tool.execute({ description: 'Info' }, session) as any;

    expect(result.updated).toBe(false);
    expect(result.error).toContain('Constraint violation');
  });


  it('getName devuelve "update_ticket"', () => {
    expect(tool.getName()).toBe('update_ticket');
  });

  it('requiresIdentification devuelve true', () => {
    expect(tool.requiresIdentification()).toBe(true);
  });

  // Este bloque existe por un fallo medido en produccion: con la marca de CSAT
  // envejecida a 3 horas, el cliente mando un "5" suelto y la herramienta
  // escribio la calificacion igual. El modelo NO mando ticket_id — el prompt ya
  // estaba limpio — pero la herramienta lo tomaba de la sesion sin mirar la fecha.
  describe('CSAT caducado', () => {
    it('no usa el pendingCsatTicketId vencido como destino', async () => {
      ticketRepo.updateTicket.mockResolvedValue({ ticketNumber: 'TBN-0009' });

      const result: any = await tool.execute(
        { root_cause: 'CSAT: 5/5' },
        {
          phoneNumber: '59171000001',
          pendingCsatTicketId: 'csat-viejo',
          pendingCsatAt: Date.now() - (3 * 60 * 60 * 1000),
          activeTicketId: null,
        } as any,
      );

      expect(ticketRepo.updateTicket).not.toHaveBeenCalled();
      expect(result.updated).toBe(false);
    });

    it('si hay un ticket activo, escribe en ESE y no en el CSAT vencido', async () => {
      ticketRepo.updateTicket.mockResolvedValue({ ticketNumber: 'TBN-0010' });

      await tool.execute(
        { description: 'la luz sigue roja' },
        {
          phoneNumber: '59171000001',
          pendingCsatTicketId: 'csat-viejo',
          pendingCsatAt: Date.now() - (3 * 60 * 60 * 1000),
          activeTicketId: 'tk-activo',
        } as any,
      );

      expect(ticketRepo.updateTicket).toHaveBeenCalledWith('tk-activo', 'la luz sigue roja', undefined);
    });

    it('dentro de la ventana sigue funcionando igual que antes', async () => {
      ticketRepo.updateTicket.mockResolvedValue({ ticketNumber: 'TBN-0011' });

      await tool.execute(
        { root_cause: 'CSAT: 5/5' },
        {
          phoneNumber: '59171000001',
          pendingCsatTicketId: 'csat-fresco',
          pendingCsatAt: Date.now(),
          activeTicketId: null,
        } as any,
      );

      expect(ticketRepo.updateTicket).toHaveBeenCalledWith('csat-fresco', '', 'CSAT: 5/5');
    });
  });

});
