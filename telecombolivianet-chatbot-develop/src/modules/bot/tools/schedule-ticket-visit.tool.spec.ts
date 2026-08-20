import { ScheduleTicketVisitTool } from './schedule-ticket-visit.tool';
import { buildClientSession } from '../../../test/factories/session.factory';

describe('ScheduleTicketVisitTool (PASO 16 Fase C)', () => {
  const ticketRepo = { scheduleTicketVisit: jest.fn() };
  let tool: ScheduleTicketVisitTool;

  beforeEach(() => {
    jest.resetAllMocks();
    tool = new ScheduleTicketVisitTool(ticketRepo as any);
  });

  it('sin ticket activo en sesión → scheduled:false, no llama al repo', async () => {
    const session = buildClientSession({ activeTicketId: null });

    const result = await tool.execute({ fecha: '2026-08-05', hora: '09:00' }, session) as any;

    expect(result.scheduled).toBe(false);
    expect(ticketRepo.scheduleTicketVisit).not.toHaveBeenCalled();
  });

  it('fecha con formato incorrecto → error, no llama al repo', async () => {
    const session = buildClientSession({ activeTicketId: 'ticket-1' });

    const result = await tool.execute({ fecha: '05/08/2026', hora: '09:00' }, session) as any;

    expect(result.scheduled).toBe(false);
    expect(result.error).toContain('fecha');
    expect(ticketRepo.scheduleTicketVisit).not.toHaveBeenCalled();
  });

  it('hora con formato incorrecto → error, no llama al repo', async () => {
    const session = buildClientSession({ activeTicketId: 'ticket-1' });

    const result = await tool.execute({ fecha: '2026-08-05', hora: '9am' }, session) as any;

    expect(result.scheduled).toBe(false);
    expect(result.error).toContain('hora');
    expect(ticketRepo.scheduleTicketVisit).not.toHaveBeenCalled();
  });

  it('sin confirmado → solo valida y devuelve resumen con botones, no agenda', async () => {
    const session = buildClientSession({ activeTicketId: 'ticket-1' });

    const result = await tool.execute({ fecha: '2026-08-05', hora: '09:00' }, session) as any;

    expect(result.scheduled).toBe(false);
    expect(result.pending).toBe(true);
    expect(result._quickReplies).toEqual([
      { id: 'confirmar_visita_tecnica', title: '✅ Confirmar visita' },
      { id: 'cancelar_visita_tecnica',  title: '❌ Cancelar' },
    ]);
    expect(ticketRepo.scheduleTicketVisit).not.toHaveBeenCalled();
  });

  it('confirmado:true → agenda de verdad', async () => {
    ticketRepo.scheduleTicketVisit.mockResolvedValue({ visitId: 'v-1', scheduledAt: '2026-08-05T13:00:00Z' });
    const session = buildClientSession({ activeTicketId: 'ticket-1' });

    const result = await tool.execute(
      { fecha: '2026-08-05', hora: '09:00', confirmado: true }, session,
    ) as any;

    expect(result.scheduled).toBe(true);
    expect(ticketRepo.scheduleTicketVisit).toHaveBeenCalledWith('ticket-1', '2026-08-05', '09:00');
  });

  it('error del repo al confirmar → scheduled:false con mensaje de error', async () => {
    ticketRepo.scheduleTicketVisit.mockRejectedValue(new Error('boom'));
    const session = buildClientSession({ activeTicketId: 'ticket-1' });

    const result = await tool.execute(
      { fecha: '2026-08-05', hora: '09:00', confirmado: true }, session,
    ) as any;

    expect(result.scheduled).toBe(false);
    expect(result.error).toContain('boom');
  });

  it('getName devuelve "schedule_ticket_visit"', () => {
    expect(tool.getName()).toBe('schedule_ticket_visit');
  });

  it('requiresIdentification devuelve true', () => {
    expect(tool.requiresIdentification()).toBe(true);
  });

  it('isMutating devuelve true', () => {
    expect(tool.isMutating()).toBe(true);
  });
});
