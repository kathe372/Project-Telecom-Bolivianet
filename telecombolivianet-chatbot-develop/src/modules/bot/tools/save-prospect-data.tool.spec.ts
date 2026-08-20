import { SaveProspectDataTool } from './save-prospect-data.tool';
import { buildSession } from '../../../test/factories/session.factory';

describe('SaveProspectDataTool', () => {
  let tool: SaveProspectDataTool;
  let mockSession: { updateSession: jest.Mock };

  beforeEach(() => {
    mockSession = { updateSession: jest.fn().mockResolvedValue(undefined) };
    tool = new SaveProspectDataTool(mockSession as any);
  });

  it('guarda nombre, CI y dirección cuando llegan los tres juntos', async () => {
    const session = buildSession();
    const result = await tool.execute(
      { nombre_contacto: 'Jhael Katherine Arce Chavez', ci_prospecto: '8041022', direccion: 'La Huerta' },
      session,
    ) as any;

    expect(result.saved).toBe(true);
    expect(mockSession.updateSession).toHaveBeenCalledWith(session.phoneNumber, {
      prospectName: 'Jhael Katherine Arce Chavez',
      prospectIdentityCard: '8041022',
      prospectAddress: 'La Huerta',
    });
  });

  it('guarda parcial (solo nombre) sin tocar los otros campos', async () => {
    const session = buildSession();
    await tool.execute({ nombre_contacto: 'Jhael' }, session);

    expect(mockSession.updateSession).toHaveBeenCalledWith(session.phoneNumber, { prospectName: 'Jhael' });
  });

  it('sin ningún dato → no guarda nada y devuelve error', async () => {
    const session = buildSession();
    const result = await tool.execute({}, session) as any;

    expect(result.saved).toBe(false);
    expect(mockSession.updateSession).not.toHaveBeenCalled();
  });

  it('recorta espacios en blanco de los valores', async () => {
    const session = buildSession();
    await tool.execute({ ci_prospecto: '  8041022  ' }, session);

    expect(mockSession.updateSession).toHaveBeenCalledWith(session.phoneNumber, { prospectIdentityCard: '8041022' });
  });

  it('no requiere identificación (aplica a prospectos)', () => {
    expect(tool.requiresIdentification()).toBe(false);
  });
});
