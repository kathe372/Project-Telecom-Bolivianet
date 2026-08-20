import { PlanChangeEffectivityPolicy } from '../domain/plan-change-effectivity';
import { ChangePlanTool } from './change-plan.tool';
import { buildClientSession } from '../../../test/factories/session.factory';


describe('ChangePlanTool', () => {
  const clientRepo    = { requestPlanChange: jest.fn() };
  const planRepo      = { getActivePlans: jest.fn() };
  const adminNotifier = { notifyTicketCreated: jest.fn() };
  let tool: ChangePlanTool;

  beforeEach(() => {
    jest.resetAllMocks();
    adminNotifier.notifyTicketCreated.mockResolvedValue(undefined);
    clientRepo.requestPlanChange.mockResolvedValue({ changeId: 'change-uuid-001' });
    planRepo.getActivePlans.mockResolvedValue([]);
    tool = new ChangePlanTool(
      clientRepo as any, planRepo as any, adminNotifier as any,
      new PlanChangeEffectivityPolicy(),
    );
  });


  it('devuelve created=false si plan_id está vacío', async () => {
    const session = buildClientSession();

    const result = await tool.execute(
      { plan_id: '', requested_plan: 'Fibra 100Mbps' },
      session,
    ) as any;

    expect(result.created).toBe(false);
    expect(result.error).toContain('get_available_plans');
    expect(clientRepo.requestPlanChange).not.toHaveBeenCalled();
  });

  it('PASO 2: devuelve created=false si plan_id no es un UUID válido → rechaza sin llamar al backend', async () => {
    const session = buildClientSession();

    const result = await tool.execute(
      { plan_id: 'plan_platinium', requested_plan: 'Plan Platinium' },
      session,
    ) as any;

    expect(result.created).toBe(false);
    expect(result.error).toContain('get_available_plans');
    expect(clientRepo.requestPlanChange).not.toHaveBeenCalled();
  });

  it('devuelve created=false si el cliente ya tiene ese plan activo', async () => {
    const session = buildClientSession({ planId: '00000000-0000-0000-0001-000000000100', planName: 'Fibra 100Mbps' });

    const result = await tool.execute(
      { plan_id: '00000000-0000-0000-0001-000000000100', requested_plan: 'Fibra 100Mbps' },
      session,
    ) as any;

    expect(result.created).toBe(false);
    expect(result.error).toContain('ya tiene activo');
    expect(clientRepo.requestPlanChange).not.toHaveBeenCalled();
  });


  it('registra solicitud de cambio y devuelve created=true', async () => {
    const session = buildClientSession({ planId: '00000000-0000-0000-0001-000000000001', planName: 'Fibra 50Mbps' });

    const result = await tool.execute(
      { plan_id: '00000000-0000-0000-0001-000000000200', requested_plan: 'Fibra 200Mbps' },
      session,
    ) as any;

    expect(result.created).toBe(true);
    expect(result.changeId).toBe('change-uuid-001');
    expect(result.requestedPlan).toBe('Fibra 200Mbps');
    expect(result.currentPlan).toBe('Fibra 50Mbps');
  });

  it('llama a requestPlanChange con clientId, plan_id y nota estructurada', async () => {
    const session = buildClientSession({ clientId: 'client-123' });

    await tool.execute(
      { plan_id: '00000000-0000-0000-0001-000000000200', requested_plan: 'Fibra 200Mbps', reason: 'Necesito más velocidad' },
      session,
    );

    expect(clientRepo.requestPlanChange).toHaveBeenCalledWith(
      'client-123',
      '00000000-0000-0000-0001-000000000200',
      expect.stringContaining('Necesito más velocidad'),
    );
  });

  it('notifica al admin con notifyTicketCreated tras registrar el cambio', async () => {
    const session = buildClientSession();

    await tool.execute(
      { plan_id: '00000000-0000-0000-0001-000000000900', requested_plan: 'Fibra 300Mbps' },
      session,
    );

    expect(adminNotifier.notifyTicketCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: 'change-uuid-001',
        priority: 'Media',
      }),
    );
  });

  it('BUG-5: sin precios comparables el mensaje es neutro (no promete plazos)', async () => {
    const session = buildClientSession();

    const result = await tool.execute(
      { plan_id: '00000000-0000-0000-0001-000000000900', requested_plan: 'Fibra 300Mbps' },
      session,
    ) as any;

    expect(result.message).toContain('confirmará la fecha');
  });

  it('BUG-5: upgrade (precio mayor) informa aplicación inmediata', async () => {
    planRepo.getActivePlans.mockResolvedValue([
      { Id: '00000000-0000-0000-0001-000000000300', Name: 'Plata', PriceMonthly: 149 },
      { Id: '00000000-0000-0000-0001-000000000900',    Name: 'Oro',   PriceMonthly: 199 },
    ]);
    const session = buildClientSession({ planId: '00000000-0000-0000-0001-000000000300' });

    const result = await tool.execute(
      { plan_id: '00000000-0000-0000-0001-000000000900', requested_plan: 'Oro' },
      session,
    ) as any;

    expect(result.message).toContain('de inmediato');
  });

  it('BUG-5: downgrade (precio menor) informa 1ro del mes siguiente', async () => {
    planRepo.getActivePlans.mockResolvedValue([
      { Id: '00000000-0000-0000-0001-000000000300', Name: 'Oro',   PriceMonthly: 199 },
      { Id: '00000000-0000-0000-0001-000000000900',    Name: 'Plata', PriceMonthly: 149 },
    ]);
    const session = buildClientSession({ planId: '00000000-0000-0000-0001-000000000300' });

    const result = await tool.execute(
      { plan_id: '00000000-0000-0000-0001-000000000900', requested_plan: 'Plata' },
      session,
    ) as any;

    expect(result.message).toContain('1ro del mes siguiente');
  });


  it('usa motivo por defecto si reason no se provee', async () => {
    const session = buildClientSession();

    await tool.execute(
      { plan_id: '00000000-0000-0000-0001-000000000900', requested_plan: 'Fibra 100Mbps' },
      session,
    );

    expect(clientRepo.requestPlanChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.stringContaining('Solicitud del cliente'),
    );
  });


  it('devuelve created=false con mensaje del backend en caso de error', async () => {
    const err = Object.assign(new Error('Conflict'), {
      response: { data: { message: 'Plan no disponible en la zona' } },
    });
    clientRepo.requestPlanChange.mockRejectedValue(err);
    const session = buildClientSession();

    const result = await tool.execute(
      { plan_id: '00000000-0000-0000-0001-000000000900', requested_plan: 'Fibra 500Mbps' },
      session,
    ) as any;

    expect(result.created).toBe(false);
    expect(result.error).toContain('Plan no disponible en la zona');
  });

  it('usa err.message si response.data.message no existe', async () => {
    clientRepo.requestPlanChange.mockRejectedValue(new Error('Network error'));
    const session = buildClientSession();

    const result = await tool.execute(
      { plan_id: '00000000-0000-0000-0001-000000000900', requested_plan: 'Fibra 100Mbps' },
      session,
    ) as any;

    expect(result.error).toContain('Network error');
  });


  it('getName devuelve "change_plan"', () => {
    expect(tool.getName()).toBe('change_plan');
  });

  it('requiresIdentification devuelve true', () => {
    expect(tool.requiresIdentification()).toBe(true);
  });

  // ── FASE C3 (2026-08-07) — el NOMBRE manda sobre el UUID del modelo ────────
  // El modelo no puede conocer el UUID: el resultado de get_available_plans no
  // sobrevive al turno (la sesion guarda solo texto). Medido en produccion: dos
  // intentos seguidos con dos UUIDs inventados distintos, ambos sintacticamente
  // validos, y el cliente atrapado en un bucle sobre un flujo de upgrade.
  describe('C3 — resolucion por nombre', () => {
    const PLANES = [
      { Id: 'a123d8a3-0e0a-4206-b051-b38592835c4b', Name: 'COBRE',    PriceMonthly: 89 },
      { Id: 'a863f733-7a79-41d9-9a2d-0c2cb9a72009', Name: 'DIAMANTE', PriceMonthly: 279 },
    ];

    it('ignora el UUID inventado y usa el del plan cuyo NOMBRE pidio el cliente', async () => {
      planRepo.getActivePlans.mockResolvedValue(PLANES);

      const r = await tool.execute(
        { plan_id: 'f7e2a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a6b', requested_plan: 'Plan DIAMANTE' },
        buildClientSession({ planId: 'a123d8a3-0e0a-4206-b051-b38592835c4b' }),
      ) as any;

      expect(r.created).toBe(true);
      expect(clientRepo.requestPlanChange).toHaveBeenCalledWith(
        expect.any(String), 'a863f733-7a79-41d9-9a2d-0c2cb9a72009', expect.any(String),
      );
    });

    it('funciona aunque el modelo no mande plan_id', async () => {
      planRepo.getActivePlans.mockResolvedValue(PLANES);

      const r = await tool.execute(
        { requested_plan: 'DIAMANTE' },
        buildClientSession({ planId: 'a123d8a3-0e0a-4206-b051-b38592835c4b' }),
      ) as any;

      expect(r.created).toBe(true);
      expect(clientRepo.requestPlanChange).toHaveBeenCalledWith(
        expect.any(String), 'a863f733-7a79-41d9-9a2d-0c2cb9a72009', expect.any(String),
      );
    });

    it('un nombre ambiguo pide aclarar, con los nombres reales', async () => {
      planRepo.getActivePlans.mockResolvedValue([
        { Id: 'id-1', Name: 'FIBRA 50',  PriceMonthly: 149 },
        { Id: 'id-2', Name: 'FIBRA 100', PriceMonthly: 199 },
      ]);

      const r = await tool.execute({ requested_plan: 'FIBRA' }, buildClientSession()) as any;

      expect(r.created).toBe(false);
      expect(r.error).toContain('FIBRA 50');
      expect(r.error).toContain('FIBRA 100');
      expect(clientRepo.requestPlanChange).not.toHaveBeenCalled();
    });

    it('si el backend rechaza el plan, el error INSTRUYE al modelo a corregirse', async () => {
      planRepo.getActivePlans.mockResolvedValue([]);
      clientRepo.requestPlanChange.mockRejectedValue({
        response: { data: { message: 'El plan seleccionado no existe o está inactivo.' } },
      });

      const r = await tool.execute(
        { plan_id: 'f7d2b27a-e16f-4a3e-a12b-2a2b0e9a1b1a', requested_plan: 'Plan DIAMANTE' },
        buildClientSession(),
      ) as any;

      expect(r.created).toBe(false);
      expect(r.error).toContain('ERROR TUYO');
      expect(r.error).toContain('get_available_plans');
      // Lo que NO debe pasar: devolver el error genérico envuelto, que es lo
      // que el modelo traducía a "hubo un problema, ¿me lo indica de nuevo?".
      // (La instrucción sí menciona esa frase, para prohibirla explícitamente.)
      expect(r.error).not.toMatch(/^No se pudo registrar la solicitud/);
      expect(r.error).toMatch(/no le digas al cliente/i);
    });
  });

});
