import { GetInstallationPlansTool } from './get-installation-plans.tool';
import { InteractiveIdCodec } from '../intents/interactive-id.codec';
import { buildClientSession } from '../../../test/factories/session.factory';

describe('GetInstallationPlansTool (PASO 8)', () => {
  const planRepo = { getActivePlans: jest.fn() };
  const sessionService = { updateSession: jest.fn().mockResolvedValue(undefined) };
  let tool: GetInstallationPlansTool;

  beforeEach(() => {
    jest.resetAllMocks();
    sessionService.updateSession.mockResolvedValue(undefined);
    tool = new GetInstallationPlansTool(planRepo as any, new InteractiveIdCodec(), sessionService as any);
  });

  it('siempre devuelve _list cuando hay planes activos', async () => {
    planRepo.getActivePlans.mockResolvedValue([
      { Id: 'p1', Name: 'Plan Cobre', SpeedMbps: 50, DownloadSpeedMbps: 50, UploadSpeedMbps: 10, PriceMonthly: 99, IsActive: true },
    ]);
    const session = buildClientSession();

    const result = await tool.execute({}, session) as any;

    expect(result._list).toBeDefined();
    expect(result._list.sections[0].rows).toHaveLength(1);
  });

  it('codifica el id de cada fila como "plan:<uuid>" vía InteractiveIdCodec', async () => {
    planRepo.getActivePlans.mockResolvedValue([
      { Id: '9f2a1c3b-4d5e-6f70-8192-a3b4c5d6e7f8', Name: 'Plan Platinium 1', SpeedMbps: 152, DownloadSpeedMbps: 152, UploadSpeedMbps: 20, PriceMonthly: 199, IsActive: true },
    ]);
    const session = buildClientSession();

    const result = await tool.execute({}, session) as any;

    expect(result._list.sections[0].rows[0].id).toBe('plan:9f2a1c3b-4d5e-6f70-8192-a3b4c5d6e7f8');
    expect(result._list.sections[0].rows[0].title).toContain('Plan Platinium 1');
    expect(result._list.sections[0].rows[0].description).toContain('199');
  });

  it('también devuelve los planes en JSON plano para que el LLM tenga el contexto (id, nombre, velocidad, precio)', async () => {
    planRepo.getActivePlans.mockResolvedValue([
      { Id: 'p1', Name: 'Plan Cobre', SpeedMbps: 50, DownloadSpeedMbps: 50, UploadSpeedMbps: 10, PriceMonthly: 99, IsActive: true },
    ]);
    const session = buildClientSession();

    const result = await tool.execute({}, session) as any;

    expect(result.plans).toEqual([
      { id: 'p1', name: 'Plan Cobre', speedMbps: 50, priceMonthly: 99 },
    ]);
  });

  it('sin planes activos → available:false, sin _list', async () => {
    planRepo.getActivePlans.mockResolvedValue([]);
    const session = buildClientSession();

    const result = await tool.execute({}, session) as any;

    expect(result.available).toBe(false);
    expect(result._list).toBeUndefined();
  });

  it('error del repositorio → available:false con mensaje, sin lanzar excepción', async () => {
    planRepo.getActivePlans.mockRejectedValue(new Error('DB caída'));
    const session = buildClientSession();

    const result = await tool.execute({}, session) as any;

    expect(result.available).toBe(false);
    expect(result.error).toContain('DB caída');
  });

  it('getName devuelve "get_installation_plans"', () => {
    expect(tool.getName()).toBe('get_installation_plans');
  });

  it('requiresIdentification devuelve false (disponible para prospectos)', () => {
    expect(tool.requiresIdentification()).toBe(false);
  });

  it('marca plansShown=true en la sesión al mostrar la lista', async () => {
    planRepo.getActivePlans.mockResolvedValue([
      { Id: 'p1', Name: 'Plan Cobre', SpeedMbps: 50, DownloadSpeedMbps: 50, UploadSpeedMbps: 10, PriceMonthly: 99, IsActive: true },
    ]);
    const session = buildClientSession({ plansShown: false });

    await tool.execute({}, session);

    expect(sessionService.updateSession).toHaveBeenCalledWith(session.phoneNumber, { plansShown: true });
  });
});
