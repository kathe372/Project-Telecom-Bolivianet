import { of, throwError } from 'rxjs';
import { AdminSignalrNotifierService, AdminEventType } from './admin-signalr-notifier.service';

function make(token: string | null = 'jwt-abc') {
  const config = { get: jest.fn(() => 'http://backend:5000') };
  const http = { post: jest.fn(() => of({ data: 'ok' })) };
  const notificationRepo = { getCurrentToken: jest.fn(() => token) };
  const svc = new AdminSignalrNotifierService(config as any, http as any, notificationRepo as any);
  return { svc, http, notificationRepo };
}

const body = (http: any) => http.post.mock.calls[0][1];
const opts = (http: any) => http.post.mock.calls[0][2];

describe('AdminSignalrNotifierService', () => {
  it('onModuleInit no lanza', () => {
    const { svc } = make();
    expect(() => svc.onModuleInit()).not.toThrow();
  });

  it('construye la URL de bot-events', () => {
    const { svc, http } = make();
    return svc.notifyEscalation({ phoneNumber: '70000001' }).then(() => {
      expect(http.post).toHaveBeenCalledWith('http://backend:5000/api/bot-events', expect.any(Object), expect.any(Object));
    });
  });

  it('notifyHighPriorityTicket → EventType TICKET_ALTA con Priority Alta', async () => {
    const { svc, http } = make();
    await svc.notifyHighPriorityTicket({ phoneNumber: '70000001', clientName: 'Ana', ticketId: 't1', description: 'sin señal' });
    expect(body(http)).toMatchObject({ EventType: AdminEventType.TICKET_ALTA, Priority: 'Alta', Reason: 'sin señal', TicketId: 't1' });
  });

  it('notifyTicketCreated → TICKET_CREATED con la prioridad dada', async () => {
    const { svc, http } = make();
    await svc.notifyTicketCreated({ phoneNumber: '70000001', clientName: 'Ana', ticketId: 't1', priority: 'Media' });
    expect(body(http)).toMatchObject({ EventType: AdminEventType.TICKET_CREATED, Priority: 'Media' });
  });

  it('notifyTicketClosed → TICKET_CLOSED', async () => {
    const { svc, http } = make();
    await svc.notifyTicketClosed({ phoneNumber: '70000001', clientName: 'Ana', ticketId: 't1' });
    expect(body(http)).toMatchObject({ EventType: AdminEventType.TICKET_CLOSED, TicketId: 't1' });
  });

  it('notifyTicketRescheduled → TICKET_RESCHEDULED con fecha/hora en Reason', async () => {
    const { svc, http } = make();
    await svc.notifyTicketRescheduled({ phoneNumber: '70000001', clientName: 'Ana', ticketId: 't1', fecha: '2026-08-01', hora: '10:00' });
    expect(body(http)).toMatchObject({ EventType: AdminEventType.TICKET_RESCHEDULED });
    expect(body(http).Reason).toContain('2026-08-01');
    expect(body(http).Reason).toContain('10:00');
  });

  it('notifyEscalation → CONVERSATION_ESCALATED con reason por defecto', async () => {
    const { svc, http } = make();
    await svc.notifyEscalation({ phoneNumber: '70000001' });
    expect(body(http)).toMatchObject({ EventType: AdminEventType.CONVERSATION_ESCALATED });
    expect(body(http).Reason).toMatch(/Solicitado por el cliente/);
  });

  it('adjunta el header Authorization cuando hay token', async () => {
    const { svc, http } = make('jwt-xyz');
    await svc.notifyEscalation({ phoneNumber: '70000001' });
    expect(opts(http).headers).toEqual({ Authorization: 'Bearer jwt-xyz' });
  });

  it('sin token → sin header Authorization', async () => {
    const { svc, http } = make(null);
    await svc.notifyEscalation({ phoneNumber: '70000001' });
    expect(opts(http).headers).toEqual({});
  });

  it('error HTTP → se traga (catchError, no lanza)', async () => {
    const { svc, http } = make();
    http.post.mockReturnValue(throwError(() => new Error('backend caído')));
    await expect(svc.notifyEscalation({ phoneNumber: '70000001' })).resolves.toBeUndefined();
  });

  it('error inesperado (getCurrentToken lanza) → capturado por el try/catch', async () => {
    const { svc, notificationRepo } = make();
    notificationRepo.getCurrentToken.mockImplementationOnce(() => { throw new Error('boom'); });
    await expect(svc.notifyEscalation({ phoneNumber: '70000001' })).resolves.toBeUndefined();
  });
});
