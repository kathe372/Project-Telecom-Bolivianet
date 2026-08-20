import { ShowMainMenuTool } from './show-main-menu.tool';
import { buildClientSession } from '../../../test/factories/session.factory';

describe('ShowMainMenuTool (PASO 6B)', () => {
  const mainMenu = { sendWelcome: jest.fn(), sendMenu: jest.fn() };
  let tool: ShowMainMenuTool;

  beforeEach(() => {
    jest.resetAllMocks();
    mainMenu.sendMenu.mockResolvedValue(undefined);
    tool = new ShowMainMenuTool(mainMenu as any);
  });

  it('envía el menú vía MainMenuService.sendMenu con un intro neutral (no repite el saludo)', async () => {
    const session = buildClientSession();

    await tool.execute({}, session);

    expect(mainMenu.sendMenu).toHaveBeenCalledTimes(1);
    expect(mainMenu.sendMenu).toHaveBeenCalledWith(session, expect.any(String));
    expect(mainMenu.sendWelcome).not.toHaveBeenCalled();
  });

  it('devuelve _mediaDelivered:true para suprimir la respuesta duplicada del LLM', async () => {
    const session = buildClientSession();

    const result = await tool.execute({}, session) as any;

    expect(result._mediaDelivered).toBe(true);
  });

  it('getName devuelve "show_main_menu"', () => {
    expect(tool.getName()).toBe('show_main_menu');
  });

  it('requiresIdentification devuelve false (disponible para prospectos)', () => {
    expect(tool.requiresIdentification()).toBe(false);
  });

  it('isMutating devuelve false', () => {
    expect(tool.isMutating()).toBe(false);
  });
});
