import { CreateSupportTicketTool } from './create-support-ticket.tool';
import { buildClientSession } from '../../../test/factories/session.factory';


// PASO 6: DueDate simula el cálculo real del backend (a partir del SlaPlan
// configurado por el admin) — el chatbot ya no decide las horas de SLA.
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

const makeTicket = (overrides: Record<string, unknown> = {}) => ({
  Id:           'ticket-uuid-001',
  TicketNumber: 'TKT-0001',
  DueDate:      inHours(4),
  ...overrides,
});

describe('CreateSupportTicketTool', () => {
  const ticketRepo   = { createTicket: jest.fn(), buildTicketSubject: jest.fn(), getClientActiveTickets: jest.fn() };
  const sessionSvc   = { updateSession: jest.fn() };
  const adminNotifier = {
    notifyHighPriorityTicket: jest.fn(),
    notifyTicketCreated:      jest.fn(),
  };
  let tool: CreateSupportTicketTool;

  beforeEach(() => {
    jest.resetAllMocks();
    sessionSvc.updateSession.mockResolvedValue(undefined);
    adminNotifier.notifyHighPriorityTicket.mockResolvedValue(undefined);
    adminNotifier.notifyTicketCreated.mockResolvedValue(undefined);
    ticketRepo.buildTicketSubject.mockReturnValue('Soporte Técnico — TBN-001');
    ticketRepo.createTicket.mockResolvedValue(makeTicket());
    ticketRepo.getClientActiveTickets.mockResolvedValue([]); // por defecto: sin tickets abiertos en backend

    tool = new CreateSupportTicketTool(
      ticketRepo as any,
      sessionSvc as any,
      adminNotifier as any,
    );
  });


  it('BUG-02: dedup solo si el backend confirma que el ticket sigue abierto', async () => {
    const session = buildClientSession({ activeTicketId: 'existing-ticket-001' });
    ticketRepo.getClientActiveTickets.mockResolvedValue([{ Id: 'existing-ticket-001' }]);

    const result = await tool.execute(
      { issue_type: 'sin_conexion', description: 'No tengo internet' },
      session,
    ) as any;

    expect(ticketRepo.getClientActiveTickets).toHaveBeenCalled();
    expect(result.created).toBe(false);
    expect(result.existingTicketId).toBe('existing-ticket-001');
    expect(ticketRepo.createTicket).not.toHaveBeenCalled();
  });

  it('PASO 2B: mensaje de dedup usa el número de ticket legible, no el GUID de sesión', async () => {
    const session = buildClientSession({ activeTicketId: '9f2a1c3b-4d5e-6f70-8192-a3b4c5d6e7f8' });
    ticketRepo.getClientActiveTickets.mockResolvedValue([
      { Id: '9f2a1c3b-4d5e-6f70-8192-a3b4c5d6e7f8', TicketNumber: 'TK-2026-0099' },
    ]);

    const result = await tool.execute(
      { issue_type: 'sin_conexion', description: 'No tengo internet' },
      session,
    ) as any;

    expect(result.message).toContain('TK-2026-0099');
    expect(result.message).not.toContain('9f2a1c3b-4d5e-6f70-8192-a3b4c5d6e7f8');
  });

  it('PASO 2B: sin TicketNumber en el ticket existente, el mensaje cae al fragmento corto del GUID', async () => {
    const session = buildClientSession({ activeTicketId: '9f2a1c3b-4d5e-6f70-8192-a3b4c5d6e7f8' });
    ticketRepo.getClientActiveTickets.mockResolvedValue([
      { Id: '9f2a1c3b-4d5e-6f70-8192-a3b4c5d6e7f8' },
    ]);

    const result = await tool.execute(
      { issue_type: 'sin_conexion', description: 'No tengo internet' },
      session,
    ) as any;

    expect(result.message).toContain('TK-9F2A1C3B');
    expect(result.message).not.toContain('9f2a1c3b-4d5e-6f70-8192-a3b4c5d6e7f8');
  });

  it('BUG-02: ticket FANTASMA (activeTicketId en sesión pero cerrado en backend) → crea + limpia sesión', async () => {
    const session = buildClientSession({ phoneNumber: '59171000001', activeTicketId: 'phantom-999' });
    ticketRepo.getClientActiveTickets.mockResolvedValue([]); // ya no está abierto en backend

    const result = await tool.execute(
      { issue_type: 'sin_conexion', description: 'No tengo internet' },
      session,
    ) as any;

    expect(result.created).toBe(true);
    expect(ticketRepo.createTicket).toHaveBeenCalledTimes(1);
    // limpió el id fantasma antes de crear
    expect(sessionSvc.updateSession).toHaveBeenCalledWith('59171000001', { activeTicketId: null });
  });

  it('crea ticket aunque exista uno activo cuando force_new=true', async () => {
    const session = buildClientSession({ activeTicketId: 'existing-ticket-001' });

    const result = await tool.execute(
      { issue_type: 'sin_conexion', description: 'Persiste', force_new: true },
      session,
    ) as any;

    expect(result.created).toBe(true);
    expect(ticketRepo.createTicket).toHaveBeenCalledTimes(1);
  });


  it('sin_conexion → prioridad Alta', async () => {
    const session = buildClientSession();

    const result = await tool.execute(
      { issue_type: 'sin_conexion', description: 'Sin internet' },
      session,
    ) as any;

    expect(result.priority).toBe('Alta');
  });

  it('velocidad_lenta → prioridad Media', async () => {
    const session = buildClientSession();

    const result = await tool.execute(
      { issue_type: 'velocidad_lenta', description: 'Lento' },
      session,
    ) as any;

    expect(result.priority).toBe('Media');
  });

  it('problema_decoder → prioridad Baja', async () => {
    const session = buildClientSession();

    const result = await tool.execute(
      { issue_type: 'problema_decoder', description: 'Decoder sin señal' },
      session,
    ) as any;

    expect(result.priority).toBe('Baja');
  });

  it('issue_type desconocido → fallback a sin_conexion (Alta)', async () => {
    const session = buildClientSession();

    const result = await tool.execute(
      { issue_type: 'tipo_inexistente', description: 'Problema raro' },
      session,
    ) as any;

    expect(result.priority).toBe('Alta');
  });

  it('PASO 6: el payload a createTicket() ya no incluye SlaDurationHours', async () => {
    const session = buildClientSession();

    await tool.execute({ issue_type: 'sin_conexion', description: 'Sin internet' }, session);

    const [payload] = ticketRepo.createTicket.mock.calls[0];
    expect(payload).not.toHaveProperty('SlaDurationHours');
  });


  it('usa notifyHighPriorityTicket para prioridad Alta', async () => {
    const session = buildClientSession();

    await tool.execute({ issue_type: 'sin_conexion', description: 'Sin internet' }, session);

    expect(adminNotifier.notifyHighPriorityTicket).toHaveBeenCalledTimes(1);
    expect(adminNotifier.notifyTicketCreated).not.toHaveBeenCalled();
  });

  it('usa notifyTicketCreated para prioridad Media/Baja', async () => {
    const session = buildClientSession();

    await tool.execute({ issue_type: 'velocidad_lenta', description: 'Lento' }, session);

    expect(adminNotifier.notifyTicketCreated).toHaveBeenCalledTimes(1);
    expect(adminNotifier.notifyHighPriorityTicket).not.toHaveBeenCalled();
  });


  it('actualiza activeTicketId en sesión tras crear el ticket', async () => {
    const session = buildClientSession({ phoneNumber: '59171000001' });
    ticketRepo.createTicket.mockResolvedValue(makeTicket({ Id: 'new-ticket-id' }));

    await tool.execute({ issue_type: 'sin_conexion', description: 'Sin servicio' }, session);

    expect(sessionSvc.updateSession).toHaveBeenCalledWith(
      '59171000001',
      { activeTicketId: 'new-ticket-id' },
    );
  });


  it('devuelve created=true con ticketNumber y sin promesa de plazo', async () => {
    const session = buildClientSession();
    ticketRepo.createTicket.mockResolvedValue(makeTicket({ TicketNumber: 'TKT-0042' }));

    const result = await tool.execute(
      { issue_type: 'sin_conexion', description: 'Sin internet' },
      session,
    ) as any;

    expect(result.created).toBe(true);
    expect(result.ticketNumber).toBe('TKT-0042');
    expect(result.message).toContain('TKT-0042');
    expect(result.message).toContain('lo antes posible');
  });

  it('2026-08-07: el DueDate ya no se enuncia — es un objetivo interno, no un compromiso', async () => {
    const session = buildClientSession();
    ticketRepo.createTicket.mockResolvedValue(makeTicket({ DueDate: inHours(2) }));

    const result = await tool.execute(
      { issue_type: 'sin_conexion', description: 'Sin internet' },
      session,
    ) as any;

    // sin_conexion ya no fija 4 horas — el DueDate simulado (2h) manda.
    expect(result.message).toContain('lo antes posible');
    expect(result.message).not.toContain('4 horas');
  });

  it('sin DueDate del backend el mensaje no cambia', async () => {
    const session = buildClientSession();
    ticketRepo.createTicket.mockResolvedValue(makeTicket({ DueDate: null }));

    const result = await tool.execute(
      { issue_type: 'sin_conexion', description: 'Sin internet' },
      session,
    ) as any;

    expect(result.message).toContain('lo antes posible');
    expect(result.message).not.toMatch(/\d+ horas/);
    // Ya no se le devuelve el vencimiento al modelo, ni null ni valor.
    expect(result.dueDate).toBeUndefined();
  });

  it('PASO 2B: sin TicketNumber del backend, cae al fragmento corto del GUID (nunca el GUID completo)', async () => {
    const session = buildClientSession();
    ticketRepo.createTicket.mockResolvedValue({ Id: '9f2a1c3b-4d5e-6f70-8192-a3b4c5d6e7f8' });

    const result = await tool.execute(
      { issue_type: 'sin_conexion', description: 'Sin internet' },
      session,
    ) as any;

    expect(result.ticketNumber).toBe('TK-9F2A1C3B');
    expect(result.message).toContain('TK-9F2A1C3B');
    expect(result.message).not.toContain('9f2a1c3b-4d5e-6f70-8192-a3b4c5d6e7f8');
  });


  it('devuelve created=false con error cuando el repositorio lanza excepción', async () => {
    ticketRepo.createTicket.mockRejectedValue(new Error('DB error'));
    const session = buildClientSession();

    const result = await tool.execute(
      { issue_type: 'sin_conexion', description: 'Error' },
      session,
    ) as any;

    expect(result.created).toBe(false);
    expect(result.error).toContain('DB error');
  });


  it('getName devuelve "create_support_ticket"', () => {
    expect(tool.getName()).toBe('create_support_ticket');
  });

  it('requiresIdentification devuelve true', () => {
    expect(tool.requiresIdentification()).toBe(true);
  });


  // 2026-08-07: se dejo de prometerle un plazo al cliente.
  //
  // El numero salia del DueDate real del backend, asi que era correcto — pero
  // es una promesa que el sistema no puede garantizar: el SLA es un objetivo
  // interno de gestion, no un compromiso. Visto en produccion: "un tecnico se
  // pondra en contacto en las proximas 124 horas".
  describe('no se le promete un plazo al cliente', () => {
    const crearCon = (dueDate: string | null) => {
      ticketRepo.createTicket.mockResolvedValue({
        Id: 'tk-1', TicketNumber: 'TBN-0001', DueDate: dueDate,
      });
      return tool.execute(
        { issue_type: 'lentitud', description: 'anda lento' },
        { phoneNumber: '59171000001', clientId: 'c-1' } as any,
      );
    };

    it('dice "lo antes posible", sin horas ni dias', async () => {
      const r: any = await crearCon(new Date(Date.now() + 124 * 3_600_000).toISOString());

      expect(r.message).toContain('lo antes posible');
      expect(r.message).not.toMatch(/\d+\s*(horas?|d[ií]as?)/);
    });

    // Sacar la frase no alcanzaba: visto en produccion, con el dato crudo a la
    // vista el modelo calculaba las horas por su cuenta y volvia a decir "en
    // las proximas 8 horas". No se le devuelve el vencimiento.
    it('el vencimiento NO llega al modelo', async () => {
      const vence = new Date(Date.now() + 8 * 3_600_000).toISOString();
      const r: any = await crearCon(vence);

      expect(r.dueDate).toBeUndefined();
      expect(JSON.stringify(r)).not.toContain(vence);
    });

    it('sin DueDate el mensaje es el mismo', async () => {
      const r: any = await crearCon(null);

      expect(r.message).toContain('lo antes posible');
    });
  });

});
