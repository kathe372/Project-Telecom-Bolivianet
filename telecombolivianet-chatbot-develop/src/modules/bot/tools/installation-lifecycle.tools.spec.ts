import { GetAvailablePlansTool } from './get-available-plans.tool';
import { GetInstallationSlotsTool } from './get-installation-slots.tool';
import { CancelInstallationTool } from './cancel-installation.tool';
import { RescheduleInstallationTool } from './reschedule-installation.tool';
import { RescheduleTicketTool } from './reschedule-ticket.tool';
import { InteractiveIdCodec } from '../intents/interactive-id.codec';
import { buildSession } from '../../../test/factories/session.factory';

const planRepoMock = {
  getActivePlans: jest.fn().mockResolvedValue([
    { Id: '11111111-1111-4111-8111-111111111111', Name: 'COBRE 20MB', PriceMonthly: 89 },
    { Id: '22222222-2222-4222-8222-222222222222',   Name: 'ORO 80MB',   PriceMonthly: 199 },
  ]),
};

describe('GetAvailablePlansTool', () => {
  it('mapea los planes con id/name/speed/price', async () => {
    const planRepo = { getActivePlans: jest.fn().mockResolvedValue([
      { Id: 'P1', Name: 'Oro', SpeedMbps: 80, PriceMonthly: 199 },
    ]) };
    const r: any = await new GetAvailablePlansTool(planRepo as any, { updateSession: jest.fn().mockResolvedValue(undefined) } as any).execute({}, buildSession());
    expect(r.available).toBe(true);
    expect(r.plans[0]).toEqual({ id: 'P1', name: 'Oro', speedMbps: 80, priceMonthly: 199 });
  });

  it('sin planes → available false', async () => {
    const planRepo = { getActivePlans: jest.fn().mockResolvedValue([]) };
    const r: any = await new GetAvailablePlansTool(planRepo as any, { updateSession: jest.fn().mockResolvedValue(undefined) } as any).execute({}, buildSession());
    expect(r.available).toBe(false);
  });


  it('error del repo → available false con mensaje', async () => {
    const planRepo = { getActivePlans: jest.fn().mockRejectedValue(new Error('down')) };
    const r: any = await new GetAvailablePlansTool(planRepo as any, { updateSession: jest.fn().mockResolvedValue(undefined) } as any).execute({}, buildSession());
    expect(r.available).toBe(false);
    expect(r.error).toContain('down');
  });
});

describe('GetInstallationSlotsTool', () => {
  const config = { get: jest.fn().mockReturnValue(7) };
  it('usa plan_id del arg o de la sesión y mapea slots', async () => {
    const repo = { getInstallationSlots: jest.fn().mockResolvedValue([
      { Fecha: '2026-08-01', HoraInicio: '09:00', Disponibles: 2 },
    ]) };
    const planId = '00000000-0000-0000-0001-000000000097';
    const r: any = await new GetInstallationSlotsTool(config as any, repo as any, new InteractiveIdCodec(), planRepoMock as any)
      .execute({ plan_id: planId }, buildSession());
    expect(repo.getInstallationSlots).toHaveBeenCalledWith(7, planId);
    expect(r.slots[0]).toEqual({ date: '2026-08-01', time: '09:00' });
  });
  it('sin slots → available false', async () => {
    const repo = { getInstallationSlots: jest.fn().mockResolvedValue([]) };
    const r: any = await new GetInstallationSlotsTool(config as any, repo as any, new InteractiveIdCodec(), planRepoMock as any).execute({}, buildSession());
    expect(r.available).toBe(false);
  });
  // 14a (2026-08-07): el cliente escribio "Cobre" en vez de tocar el boton, el
  // modelo fabrico `plan_id: "cobre-20mb-89bs"` y la herramienta devolvia un
  // error pidiendole que se corrigiera solo. El modelo lo ignoro y le dijo al
  // cliente "hubo un problema, intenta mas tarde". El nombre esta DENTRO del id
  // fabricado: resolverlo nosotros es determinista.
  it('resuelve por nombre un plan_id fabricado por el modelo', async () => {
    const repo = { getInstallationSlots: jest.fn().mockResolvedValue([
      { Fecha: '2026-08-01', HoraInicio: '09:00', Disponibles: 2 },
    ]) };
    const r: any = await new GetInstallationSlotsTool(
      config as any, repo as any, new InteractiveIdCodec(), planRepoMock as any,
    ).execute({ plan_id: 'cobre-20mb-89bs' }, buildSession());

    expect(repo.getInstallationSlots).toHaveBeenCalledWith(7, '11111111-1111-4111-8111-111111111111');
    expect(r.available).not.toBe(false);
  });

  it('un nombre que no existe sigue devolviendo el error de autocorreccion', async () => {
    const repo = { getInstallationSlots: jest.fn() };
    const r: any = await new GetInstallationSlotsTool(
      config as any, repo as any, new InteractiveIdCodec(), planRepoMock as any,
    ).execute({ plan_id: 'plan-bronce-inventado' }, buildSession());

    expect(r.error).toMatch(/plan_id inv[aá]lido/);
    // Interno: no debe mostrarsele al cliente.
    expect(r.errorInterno).toBe(true);
    expect(repo.getInstallationSlots).not.toHaveBeenCalled();
  });
});

describe('CancelInstallationTool', () => {
  const session = { updateSession: jest.fn().mockResolvedValue(undefined) };

  it('sin instalación activa → cancelled false', async () => {
    const repo = { cancelInstallation: jest.fn() , findScheduledInstallationByPhone: jest.fn().mockResolvedValue(null)};
    const r: any = await new CancelInstallationTool(repo as any, session as any)
      .execute({ motivo: 'x' }, buildSession({ activeInstallationId: null }));
    expect(r.cancelled).toBe(false);
    expect(repo.cancelInstallation).not.toHaveBeenCalled();
  });

  it('sin confirmado → pending, no llama al backend (PASO 13)', async () => {
    const repo = { cancelInstallation: jest.fn() , findScheduledInstallationByPhone: jest.fn().mockResolvedValue(null)};
    const r: any = await new CancelInstallationTool(repo as any, session as any)
      .execute({ motivo: 'me mudo' }, buildSession({ activeInstallationId: 'I1' }));
    expect(r.pending).toBe(true);
    expect(repo.cancelInstallation).not.toHaveBeenCalled();
  });

  it('cancela y limpia la instalación de la sesión', async () => {
    const repo = { cancelInstallation: jest.fn().mockResolvedValue(undefined) , findScheduledInstallationByPhone: jest.fn().mockResolvedValue(null)};
    const r: any = await new CancelInstallationTool(repo as any, session as any)
      .execute({ motivo: 'me mudo', confirmado: true }, buildSession({ activeInstallationId: 'I1' }));
    expect(r.cancelled).toBe(true);
    expect(repo.cancelInstallation).toHaveBeenCalledWith('I1', 'me mudo');
  });

  it('error de anticipación mínima (422) → mensaje pidiendo agente', async () => {
    const repo = { cancelInstallation: jest.fn().mockRejectedValue({ response: { status: 422, findScheduledInstallationByPhone: jest.fn().mockResolvedValue(null), data: { message: 'Requiere 24 horas de anticipación' } } }) };
    const r: any = await new CancelInstallationTool(repo as any, session as any)
      .execute({ motivo: 'x', confirmado: true }, buildSession({ activeInstallationId: 'I1' }));
    expect(r.cancelled).toBe(false);
    expect(r.error).toContain('agente');
  });
});

describe('RescheduleInstallationTool', () => {
  it('valida formato de fecha/hora', async () => {
    const repo = { rescheduleInstallation: jest.fn() , findScheduledInstallationByPhone: jest.fn().mockResolvedValue(null)};
    const t = new RescheduleInstallationTool(repo as any);
    const s = buildSession({ activeInstallationId: 'I1' });
    expect((await t.execute({ nueva_fecha: '01-08-2026', nueva_hora: '10:00' }, s) as any).rescheduled).toBe(false);
    expect((await t.execute({ nueva_fecha: '2026-08-01', nueva_hora: '10' }, s) as any).rescheduled).toBe(false);
  });
  it('sin confirmado → pending, no llama al backend (PASO 13)', async () => {
    const repo = { rescheduleInstallation: jest.fn() , findScheduledInstallationByPhone: jest.fn().mockResolvedValue(null)};
    const r: any = await new RescheduleInstallationTool(repo as any)
      .execute({ nueva_fecha: '2026-08-01', nueva_hora: '10:00' }, buildSession({ activeInstallationId: 'I1' }));
    expect(r.pending).toBe(true);
    expect(repo.rescheduleInstallation).not.toHaveBeenCalled();
  });

  it('reprograma con datos válidos', async () => {
    const repo = { rescheduleInstallation: jest.fn().mockResolvedValue(undefined) , findScheduledInstallationByPhone: jest.fn().mockResolvedValue(null)};
    const r: any = await new RescheduleInstallationTool(repo as any)
      .execute({ nueva_fecha: '2026-08-01', nueva_hora: '10:00', confirmado: true }, buildSession({ activeInstallationId: 'I1' }));
    expect(r.rescheduled).toBe(true);
    expect(repo.rescheduleInstallation).toHaveBeenCalledWith('I1', '2026-08-01', '10:00', undefined);
  });
  it('sin instalación activa → error', async () => {
    const r: any = await new RescheduleInstallationTool({ rescheduleInstallation: jest.fn() , findScheduledInstallationByPhone: jest.fn().mockResolvedValue(null)} as any)
      .execute({ nueva_fecha: '2026-08-01', nueva_hora: '10:00' }, buildSession({ activeInstallationId: null }));
    expect(r.rescheduled).toBe(false);
  });
});

describe('RescheduleTicketTool', () => {
  const notifier = { notifyTicketRescheduled: jest.fn().mockResolvedValue(undefined) };
  it('reagenda la visita del ticket activo', async () => {
    const repo = { rescheduleTicket: jest.fn().mockResolvedValue({ ticketNumber: null }) };
    const r: any = await new RescheduleTicketTool(repo as any, notifier as any)
      .execute({ fecha: '2026-08-01', hora: '10:00' }, buildSession({ activeTicketId: 'T1' }));
    expect(r.rescheduled).toBe(true);
    expect(repo.rescheduleTicket).toHaveBeenCalledWith('T1', '2026-08-01', '10:00');
  });
  it('sin ticket ni fecha → error', async () => {
    const repo = { rescheduleTicket: jest.fn() };
    const t = new RescheduleTicketTool(repo as any, notifier as any);
    expect((await t.execute({ fecha: '2026-08-01', hora: '10:00' }, buildSession({ activeTicketId: null })) as any).rescheduled).toBe(false);
    expect((await t.execute({}, buildSession({ activeTicketId: 'T1' })) as any).rescheduled).toBe(false);
  });

  it('PASO 2B: mensaje usa el número de ticket legible, no el GUID crudo', async () => {
    const repo = { rescheduleTicket: jest.fn().mockResolvedValue({ ticketNumber: 'TK-2026-0021' }) };
    const r: any = await new RescheduleTicketTool(repo as any, notifier as any)
      .execute({ fecha: '2026-08-01', hora: '10:00' }, buildSession({ activeTicketId: '9f2a1c3b-4d5e-6f70-8192-a3b4c5d6e7f8' }));
    expect(r.ticketNumber).toBe('TK-2026-0021');
    expect(r.message).toContain('TK-2026-0021');
    expect(r.message).not.toContain('9f2a1c3b-4d5e-6f70-8192-a3b4c5d6e7f8');
  });

  it('PASO 2B: sin ticketNumber del backend, el mensaje cae al fragmento corto del GUID', async () => {
    const repo = { rescheduleTicket: jest.fn().mockResolvedValue({ ticketNumber: null }) };
    const r: any = await new RescheduleTicketTool(repo as any, notifier as any)
      .execute({ fecha: '2026-08-01', hora: '10:00' }, buildSession({ activeTicketId: '9f2a1c3b-4d5e-6f70-8192-a3b4c5d6e7f8' }));
    expect(r.ticketNumber).toBe('TK-9F2A1C3B');
    expect(r.message).not.toContain('9f2a1c3b-4d5e-6f70-8192-a3b4c5d6e7f8');
  });

  // P2.2 (auditoría 2026-08): la sesión es la fuente de verdad ante un
  // ticket_id corrompido/inventado por el modelo (mismo guard que ya tienen
  // update_ticket/close_support_ticket/reopen_support_ticket).
  it('P2.2 — la sesión gana cuando ticket_id de args NO coincide con activeTicketId de sesión', async () => {
    const repo = { rescheduleTicket: jest.fn().mockResolvedValue({ ticketNumber: null }) };
    await new RescheduleTicketTool(repo as any, notifier as any).execute(
      { ticket_id: 'arg-ticket-inventado', fecha: '2026-08-01', hora: '10:00' },
      buildSession({ activeTicketId: 'session-ticket-real' }),
    );
    expect(repo.rescheduleTicket).toHaveBeenCalledWith('session-ticket-real', '2026-08-01', '10:00');
  });

});

// Medido en produccion (2026-08-07): un prospecto con instalacion vigente
// quedaba ATRAPADO. get_active_installation le decia "no tenes ninguna",
// create_installation se la rechazaba por duplicada, y reschedule fallaba con
// "hubo un problema". Las tres por lo mismo: la instalacion de un prospecto se
// guarda con ProspectPhone y nadie consultaba por telefono.
describe('prospecto sin activeInstallationId en sesion', () => {
  const conRepo = (extra: Record<string, any>): any => ({
    findScheduledInstallationByPhone: jest.fn().mockResolvedValue('ins-por-telefono'),
    ...extra,
  });

  it('reprogramar encuentra la instalacion por telefono', async () => {
    const repo = conRepo({ rescheduleInstallation: jest.fn().mockResolvedValue(undefined) });
    const sess = { phoneNumber: '64638535', activeInstallationId: null } as any;

    await new RescheduleInstallationTool(repo as any)
      .execute({ nueva_fecha: '2026-08-12', nueva_hora: '10:00', confirmado: true }, sess);

    expect(repo.findScheduledInstallationByPhone).toHaveBeenCalledWith('64638535');
    expect(repo.rescheduleInstallation).toHaveBeenCalledWith(
      'ins-por-telefono', '2026-08-12', '10:00', undefined,
    );
  });

  it('cancelar tambien la encuentra', async () => {
    const repo = conRepo({ cancelInstallation: jest.fn().mockResolvedValue(undefined) });
    const sess = { phoneNumber: '64638535', activeInstallationId: null } as any;

    await new CancelInstallationTool(repo as any, { updateSession: jest.fn() } as any)
      .execute({ motivo: 'ya no lo necesito', confirmado: true }, sess);

    expect(repo.cancelInstallation).toHaveBeenCalledWith('ins-por-telefono', 'ya no lo necesito');
  });

  it('si de verdad no hay ninguna, sigue devolviendo el error claro', async () => {
    const repo = {
      findScheduledInstallationByPhone: jest.fn().mockResolvedValue(null),
      cancelInstallation: jest.fn(),
    };
    const r: any = await new CancelInstallationTool(repo as any, { updateSession: jest.fn() } as any)
      .execute({ motivo: 'x', confirmado: true }, { phoneNumber: '64638535' } as any);

    expect(r.cancelled).toBe(false);
    expect(repo.cancelInstallation).not.toHaveBeenCalled();
  });
});
