import { ProcedureActionsService } from './procedure-actions.service';

/**
 * Las acciones de un bloque corren en cadena, y la segunda tiene que ver lo que
 * hizo la primera. Medido en produccion: `crear_ticket` guardaba el ticket en
 * la sesion, `ofrecer_visita` corria con la copia vieja (activeTicketId en
 * null) y al cliente no le llegaban los horarios — solo el mensaje de respaldo.
 */
describe('ProcedureActionsService', () => {
  const crearTicket    = { execute: jest.fn() };
  const horariosVisita = { execute: jest.fn() };
  const escalar        = { execute: jest.fn() };
  const sessionService = { getSession: jest.fn() };
  let svc: ProcedureActionsService;

  const sesion = () => ({ phoneNumber: '59171000001', clientId: 'c-1', activeTicketId: null }) as any;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new ProcedureActionsService(
      crearTicket as any, horariosVisita as any, escalar as any, sessionService as any,
    );
  });

  it('la accion siguiente ve el ticket que creo la anterior', async () => {
    crearTicket.execute.mockResolvedValue({ created: true, ticketNumber: 'TBN-0001' });
    sessionService.getSession.mockResolvedValue({ activeTicketId: 'tk-nuevo' });
    horariosVisita.execute.mockResolvedValue({ _list: { sections: [] } });
    const s = sesion();

    const r = await svc.ejecutar(
      [{ name: 'crear_ticket', params: { tipo: 'cable_cortado' } }, { name: 'ofrecer_visita', params: {} }],
      s, 'no tengo internet',
    );

    expect(s.activeTicketId).toBe('tk-nuevo');
    expect(r.lista).toBeDefined();
    expect(r.extra).toContain('TBN-0001');
    expect(r.ok).toBe(true);
  });

  // Nunca anunciar un ticket que no se creo.
  it('si el ticket falla, lo dice y marca el bloque como fallido', async () => {
    crearTicket.execute.mockResolvedValue({ created: false, error: 'backend caido' });

    const r = await svc.ejecutar([{ name: 'crear_ticket', params: {} }], sesion(), 'x');

    expect(r.ok).toBe(false);
    expect(r.extra).toMatch(/No pude registrar el ticket/);
    expect(r.extra).not.toMatch(/TBN/);
  });

  // Sin horarios disponibles no se promete una visita que no se agendo.
  it('sin horarios, deriva a un agente en vez de prometer la visita', async () => {
    horariosVisita.execute.mockResolvedValue({ found: false });

    const r = await svc.ejecutar([{ name: 'ofrecer_visita', params: {} }], sesion(), 'x');

    expect(r.lista).toBeUndefined();
    expect(r.extra).toMatch(/agente/i);
  });

  it('una accion que revienta no tumba el bloque entero', async () => {
    crearTicket.execute.mockRejectedValue(new Error('timeout'));

    const r = await svc.ejecutar([{ name: 'crear_ticket', params: {} }], sesion(), 'x');

    expect(r.ok).toBe(false);
    expect(r.extra).toMatch(/No pude completar/);
  });
});
