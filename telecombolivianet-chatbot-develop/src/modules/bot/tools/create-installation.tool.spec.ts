import { CreateInstallationTool } from './create-installation.tool';
import { buildSession, buildClientSession } from '../../../test/factories/session.factory';

const COBRE = { Id: 'a123d8a3-0e0a-4206-b051-b38592835c4b', Name: 'COBRE', SpeedMbps: 20, PriceMonthly: 89 };
const ORO   = { Id: '6eac6c66-631e-48f2-81f9-450593d370aa', Name: 'ORO',   SpeedMbps: 80, PriceMonthly: 199 };

function build() {
  const installationRepo = { createInstallation: jest.fn().mockResolvedValue({ InstalacionId: 'inst-uuid-0001' }) };
  const planRepo         = { getActivePlans: jest.fn().mockResolvedValue([COBRE, ORO]) };
  const sessionService   = { updateSession: jest.fn().mockResolvedValue(undefined) };
  const adminNotifier    = { notifyTicketCreated: jest.fn().mockResolvedValue(undefined) };

  const tool = new CreateInstallationTool(
    installationRepo as any, planRepo as any, sessionService as any, adminNotifier as any,
  );
  jest.spyOn((tool as any).logger, 'warn').mockImplementation(() => undefined);

  return { tool, installationRepo, planRepo, sessionService };
}

const DATOS = {
  fecha: '2026-08-11',
  hora:  '12:20',
  direccion: 'Av. Blanco Galindo km 4, Cochabamba',
  nombre_contacto: 'Milena Belén Arce',
  ci_prospecto: '78552566',
  telefono_respaldo: '76653234',
};

describe('CreateInstallationTool — FASE C4: el resumen debe decir QUÉ se contrata', () => {
  afterEach(() => jest.restoreAllMocks());

  // En producción el cliente tocó COBRE (Bs. 89), el bot le confirmó "PLATINO,
  // Bs. 399/mes", el resumen no mencionó ningún plan y el sistema agendó COBRE.
  // Bs. 310/mes de diferencia sin un solo momento en que pudiera notarlo.
  it('el resumen incluye nombre y precio del plan que REALMENTE se va a agendar', async () => {
    const { tool } = build();
    const session = buildSession({ selectedPlanId: COBRE.Id });

    const r = await tool.execute({ ...DATOS }, session) as any;

    expect(r.created).toBe(false);
    expect(r.pending).toBe(true);
    expect(r.message).toContain('COBRE');
    expect(r.message).toContain('89');
    expect(r.message).toContain('2026-08-11');
    expect(r.message).toContain('12:20');
  });

  it('usa el plan de la SESIÓN, no el que mande el modelo', async () => {
    const { tool } = build();
    const session = buildSession({ selectedPlanId: COBRE.Id });

    // El modelo insiste con otro plan real (ORO). Debe ganar la sesión.
    const r = await tool.execute({ ...DATOS, plan_id: ORO.Id }, session) as any;

    expect(r.message).toContain('COBRE');
    expect(r.message).not.toContain('ORO');
    expect(r.message).not.toContain('199');
  });

  it('instruye al agente a no reescribir el resumen', async () => {
    const { tool } = build();

    const r = await tool.execute({ ...DATOS }, buildSession({ selectedPlanId: COBRE.Id })) as any;

    expect(r.nota_para_el_agente).toMatch(/TAL CUAL/i);
  });

  it('unas coordenadas crudas se muestran como ubicación GPS, no como número suelto', async () => {
    const { tool } = build();

    const r = await tool.execute(
      { ...DATOS, direccion: '-17.3550441, -66.1629425' },
      buildSession({ selectedPlanId: COBRE.Id }),
    ) as any;

    expect(r.message).toMatch(/ubicación que compartiste por GPS/i);
    expect(r.message).toContain('-17.3550441');
  });

  it('si la consulta de planes falla, el resumen sale igual (sin la línea del plan)', async () => {
    const { tool, planRepo } = build();
    planRepo.getActivePlans.mockRejectedValue(new Error('backend caído'));

    const r = await tool.execute({ ...DATOS }, buildSession({ selectedPlanId: COBRE.Id })) as any;

    expect(r.pending).toBe(true);          // no bloquea el agendamiento
    expect(r.plan).toBeNull();
    expect(r.message).toContain('2026-08-11');
  });

  it('sin confirmar NUNCA llama al backend', async () => {
    const { tool, installationRepo } = build();

    await tool.execute({ ...DATOS }, buildSession({ selectedPlanId: COBRE.Id }));

    expect(installationRepo.createInstallation).not.toHaveBeenCalled();
  });

  it('con confirmado=true sí agenda, y con el plan de la sesión', async () => {
    const { tool, installationRepo } = build();

    const r = await tool.execute(
      { ...DATOS, confirmado: true, plan_id: ORO.Id },
      buildClientSession({ selectedPlanId: COBRE.Id, clientId: 'C-1' }),
    ) as any;

    expect(r.created).toBe(true);
    expect(installationRepo.createInstallation).toHaveBeenCalledWith(
      expect.objectContaining({ PlanId: COBRE.Id }),
    );
  });
});
