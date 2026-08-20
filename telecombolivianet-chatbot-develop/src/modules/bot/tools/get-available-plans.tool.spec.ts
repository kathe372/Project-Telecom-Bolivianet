import { GetAvailablePlansTool } from './get-available-plans.tool';
import { buildClientSession } from '../../../test/factories/session.factory';

describe('GetAvailablePlansTool', () => {
  const planRepo = { getActivePlans: jest.fn() };
  const sessionService = { updateSession: jest.fn().mockResolvedValue(undefined) };
  let tool: GetAvailablePlansTool;

  beforeEach(() => {
    jest.resetAllMocks();
    sessionService.updateSession.mockResolvedValue(undefined);
    tool = new GetAvailablePlansTool(planRepo as any, sessionService as any);
  });

  it('devuelve los planes en JSON plano', async () => {
    planRepo.getActivePlans.mockResolvedValue([
      { Id: 'p1', Name: 'Plan Cobre', SpeedMbps: 50, DownloadSpeedMbps: 50, UploadSpeedMbps: 10, PriceMonthly: 99, IsActive: true },
    ]);
    const session = buildClientSession();

    const result = await tool.execute({}, session) as any;

    expect(result.available).toBe(true);
    expect(result.plans).toEqual([
      { id: 'p1', name: 'Plan Cobre', speedMbps: 50, priceMonthly: 99 },
    ]);
  });

  it('PASO 8: NUNCA devuelve _list — es la tool informativa/de change_plan, no la de instalación (get_installation_plans)', async () => {
    planRepo.getActivePlans.mockResolvedValue([
      { Id: 'p1', Name: 'Plan Cobre', SpeedMbps: 50, DownloadSpeedMbps: 50, UploadSpeedMbps: 10, PriceMonthly: 99, IsActive: true },
    ]);
    const session = buildClientSession();

    const result = await tool.execute({}, session) as any;

    expect(result._list).toBeUndefined();
  });

  it('sin planes activos → available:false', async () => {
    planRepo.getActivePlans.mockResolvedValue([]);
    const session = buildClientSession();

    const result = await tool.execute({}, session) as any;

    expect(result.available).toBe(false);
  });

  it('error del repositorio → available:false con mensaje', async () => {
    planRepo.getActivePlans.mockRejectedValue(new Error('DB caída'));
    const session = buildClientSession();

    const result = await tool.execute({}, session) as any;

    expect(result.available).toBe(false);
    expect(result.error).toContain('DB caída');
  });

  it('getName devuelve "get_available_plans"', () => {
    expect(tool.getName()).toBe('get_available_plans');
  });

  it('marca plansShown=true en la sesión al mostrar los planes (evita repreguntar tras compartir ubicación)', async () => {
    planRepo.getActivePlans.mockResolvedValue([
      { Id: 'p1', Name: 'Plan Cobre', SpeedMbps: 50, DownloadSpeedMbps: 50, UploadSpeedMbps: 10, PriceMonthly: 99, IsActive: true },
    ]);
    const session = buildClientSession({ plansShown: false });

    await tool.execute({}, session);

    expect(sessionService.updateSession).toHaveBeenCalledWith(session.phoneNumber, { plansShown: true });
  });

  it('si plansShown ya era true, no vuelve a escribir en la sesión', async () => {
    planRepo.getActivePlans.mockResolvedValue([
      { Id: 'p1', Name: 'Plan Cobre', SpeedMbps: 50, DownloadSpeedMbps: 50, UploadSpeedMbps: 10, PriceMonthly: 99, IsActive: true },
    ]);
    const session = buildClientSession({ plansShown: true });

    await tool.execute({}, session);

    expect(sessionService.updateSession).not.toHaveBeenCalled();
  });
});
