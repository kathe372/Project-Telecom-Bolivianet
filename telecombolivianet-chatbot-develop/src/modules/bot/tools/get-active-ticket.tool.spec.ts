import { GetActiveTicketTool } from './get-active-ticket.tool';
import { buildClientSession } from '../../../test/factories/session.factory';


const makeTicket = (overrides: Record<string, unknown> = {}) => ({
  Id:             'ticket-uuid-001',
  TicketNumber:   'TKT-0001',
  Status:         'Abierto',
  Type:           'SoporteTecnico',
  AssignedToName: null,
  SlaDeadline:    null,
  CreatedAt:      '2024-06-15T10:00:00Z',
  ...overrides,
});

describe('GetActiveTicketTool', () => {
  const ticketRepo = { getClientActiveTickets: jest.fn() };
  let tool: GetActiveTicketTool;

  beforeEach(() => {
    jest.resetAllMocks();
    tool = new GetActiveTicketTool(ticketRepo as any);
  });


  it('devuelve found=false cuando el cliente no tiene tickets activos', async () => {
    ticketRepo.getClientActiveTickets.mockResolvedValue([]);
    const session = buildClientSession();

    const result = await tool.execute({}, session) as any;

    expect(result.found).toBe(false);
    expect(result.message).toContain('No tiene tickets');
  });


  it('devuelve found=true con el conteo correcto de tickets', async () => {
    ticketRepo.getClientActiveTickets.mockResolvedValue([makeTicket(), makeTicket({ Id: 'uuid-002', TicketNumber: 'TKT-0002' })]);
    const session = buildClientSession();

    const result = await tool.execute({}, session) as any;

    expect(result.found).toBe(true);
    expect(result.count).toBe(2);
    expect(result.tickets).toHaveLength(2);
  });

  it('formatea el estado "Abierto" con etiqueta emoji', async () => {
    ticketRepo.getClientActiveTickets.mockResolvedValue([makeTicket({ Status: 'Abierto' })]);
    const session = buildClientSession();

    const result = await tool.execute({}, session) as any;

    expect(result.tickets[0].status).toContain('🟡');
    expect(result.tickets[0].status).toContain('Abierto');
  });

  it('formatea el estado "EnProceso" con etiqueta emoji azul', async () => {
    ticketRepo.getClientActiveTickets.mockResolvedValue([makeTicket({ Status: 'EnProceso' })]);
    const session = buildClientSession();

    const result = await tool.execute({}, session) as any;

    expect(result.tickets[0].status).toContain('🔵');
  });

  it('muestra estado raw si no está en el mapa de etiquetas', async () => {
    ticketRepo.getClientActiveTickets.mockResolvedValue([makeTicket({ Status: 'EstadoRaro' })]);
    const session = buildClientSession();

    const result = await tool.execute({}, session) as any;

    expect(result.tickets[0].status).toBe('EstadoRaro');
  });

  it('usa Id truncado cuando no hay TicketNumber', async () => {
    ticketRepo.getClientActiveTickets.mockResolvedValue([
      makeTicket({ TicketNumber: null, Id: 'abcdef12-0000-0000-0000-000000000000' }),
    ]);
    const session = buildClientSession();

    const result = await tool.execute({}, session) as any;

    expect(result.tickets[0].number).toBe('ABCDEF12');
  });

  it('muestra "Pendiente de asignación" cuando AssignedToName es null', async () => {
    ticketRepo.getClientActiveTickets.mockResolvedValue([makeTicket({ AssignedToName: null })]);
    const session = buildClientSession();

    const result = await tool.execute({}, session) as any;

    expect(result.tickets[0].technician).toBe('Pendiente de asignación');
  });

  it('muestra el nombre del técnico cuando está asignado', async () => {
    ticketRepo.getClientActiveTickets.mockResolvedValue([
      makeTicket({ AssignedToName: 'Carlos Mamani' }),
    ]);
    const session = buildClientSession();

    const result = await tool.execute({}, session) as any;

    expect(result.tickets[0].technician).toBe('Carlos Mamani');
  });

  it('muestra "Sin fecha límite registrada" cuando SlaDeadline es null', async () => {
    ticketRepo.getClientActiveTickets.mockResolvedValue([makeTicket({ SlaDeadline: null })]);
    const session = buildClientSession();

    const result = await tool.execute({}, session) as any;

    // FASE G5: el campo se renombró a propósito. El modelo lee la CLAVE del
    // JSON, no la descripción de la tool: llamarlo `deadline` era una invitación
    // a narrarlo como la hora de la visita, y eso fue exactamente lo que pasó.
    expect(result.tickets[0].plazo_interno_sla_NO_ES_LA_HORA_DE_LA_VISITA)
      .toBe('Sin fecha límite registrada');
    expect(result.tickets[0].deadline).toBeUndefined();
  });


  it('devuelve objeto error cuando el repositorio lanza excepción', async () => {
    ticketRepo.getClientActiveTickets.mockRejectedValue(new Error('API timeout'));
    const session = buildClientSession();

    const result = await tool.execute({}, session) as any;

    expect(result.error).toContain('API timeout');
  });


  it('getName devuelve "get_active_ticket"', () => {
    expect(tool.getName()).toBe('get_active_ticket');
  });

  it('requiresIdentification devuelve true', () => {
    expect(tool.requiresIdentification()).toBe(true);
  });

  // ── FASE G5 (2026-08-07) — HALLAZGO 23 ─────────────────────────────────────
  // Medido en producción: instalación agendada 12:20, el bot le dijo al cliente
  // 10:20 — el vencimiento del SLA de este ticket. El cliente se organizó para
  // las 10:20 y el técnico llegó dos horas después.
  describe('G5 — el plazo del SLA no puede confundirse con la hora de una visita', () => {
    it('no expone ningún campo que parezca la hora de la cita', async () => {
      ticketRepo.getClientActiveTickets.mockResolvedValue([{
        Id: 'tk-1', TicketNumber: 'TBN-0001', Status: 'Abierto', Type: 'Instalacion',
        AssignedToName: null, SlaDeadline: '2026-08-11T14:20:00Z',
        CreatedAt: '2026-08-10T12:00:00Z',
      }]);

      const r: any = await tool.execute({}, { clientId: 'c-1' } as any);
      const claves = Object.keys(r.tickets[0]);

      expect(claves).not.toContain('deadline');
      expect(claves.some(k => /^(fecha|hora)/i.test(k))).toBe(false);
    });

    it('deriva explícitamente a get_active_installation', async () => {
      ticketRepo.getClientActiveTickets.mockResolvedValue([{
        Id: 'tk-1', TicketNumber: 'TBN-0001', Status: 'Abierto', Type: 'Instalacion',
        AssignedToName: null, SlaDeadline: null, CreatedAt: '2026-08-10T12:00:00Z',
      }]);

      const r: any = await tool.execute({}, { clientId: 'c-1' } as any);

      expect(r.nota_para_el_agente).toMatch(/get_active_installation/);
      expect((tool.getDeclaration() as any).description).toMatch(/get_active_installation/);
    });
  });

});
