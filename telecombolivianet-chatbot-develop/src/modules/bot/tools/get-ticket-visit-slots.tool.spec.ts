import { GetTicketVisitSlotsTool } from './get-ticket-visit-slots.tool';
import { InteractiveIdCodec } from '../intents/interactive-id.codec';
import { buildClientSession } from '../../../test/factories/session.factory';

describe('GetTicketVisitSlotsTool (PASO 16 Fase C)', () => {
  const ticketRepo = { getTicketVisitSlots: jest.fn() };
  let tool: GetTicketVisitSlotsTool;

  beforeEach(() => {
    jest.resetAllMocks();
    tool = new GetTicketVisitSlotsTool(ticketRepo as any, new InteractiveIdCodec());
  });

  it('sin ticket activo en sesión → available:false, no consulta el repo', async () => {
    const session = buildClientSession({ activeTicketId: null });

    const result = await tool.execute({}, session) as any;

    expect(result.available).toBe(false);
    expect(ticketRepo.getTicketVisitSlots).not.toHaveBeenCalled();
  });

  it('sin slots disponibles → available:false con mensaje', async () => {
    ticketRepo.getTicketVisitSlots.mockResolvedValue([]);
    const session = buildClientSession({ activeTicketId: 'ticket-1' });

    const result = await tool.execute({}, session) as any;

    expect(result.available).toBe(false);
    expect(result.message).toContain('No hay horarios');
  });

  it('con slots → available:true y arma _list con ids codificados', async () => {
    ticketRepo.getTicketVisitSlots.mockResolvedValue([
      { Fecha: '2026-08-05', HoraInicio: '09:00', HoraFin: '10:00', Disponibles: 2, Disponible: true, WithinSla: true },
      { Fecha: '2026-08-05', HoraInicio: '10:00', HoraFin: '11:00', Disponibles: 1, Disponible: true, WithinSla: false },
    ]);
    const session = buildClientSession({ activeTicketId: 'ticket-1' });

    const result = await tool.execute({}, session) as any;

    expect(result.available).toBe(true);
    expect(result.slotCount).toBe(2);
    expect(result._list.sections[0].rows).toHaveLength(2);
    expect(result._list.sections[0].rows[0].id).toBe('slot:2026-08-05:09:00');
    expect(result._list.sections[0].rows[1].description).toContain('fuera del plazo de SLA');
  });

  it('recorta a máximo 10 filas', async () => {
    ticketRepo.getTicketVisitSlots.mockResolvedValue(
      Array.from({ length: 15 }, (_, i) => ({
        Fecha: '2026-08-05', HoraInicio: `0${i}:00`.slice(-5), HoraFin: '10:00',
        Disponibles: 1, Disponible: true, WithinSla: true,
      })),
    );
    const session = buildClientSession({ activeTicketId: 'ticket-1' });

    const result = await tool.execute({}, session) as any;

    expect(result.slotCount).toBe(10);
  });

  it('pasa dias_adelante al repo (default 5)', async () => {
    ticketRepo.getTicketVisitSlots.mockResolvedValue([]);
    const session = buildClientSession({ activeTicketId: 'ticket-1' });

    await tool.execute({}, session);
    expect(ticketRepo.getTicketVisitSlots).toHaveBeenCalledWith('ticket-1', 5);

    await tool.execute({ dias_adelante: 3 }, session);
    expect(ticketRepo.getTicketVisitSlots).toHaveBeenCalledWith('ticket-1', 3);
  });

  it('error del repo → available:false con mensaje de error', async () => {
    ticketRepo.getTicketVisitSlots.mockRejectedValue(new Error('boom'));
    const session = buildClientSession({ activeTicketId: 'ticket-1' });

    const result = await tool.execute({}, session) as any;

    expect(result.available).toBe(false);
    expect(result.error).toContain('boom');
  });

  it('getName devuelve "get_ticket_visit_slots"', () => {
    expect(tool.getName()).toBe('get_ticket_visit_slots');
  });

  it('requiresIdentification devuelve true', () => {
    expect(tool.requiresIdentification()).toBe(true);
  });
});
