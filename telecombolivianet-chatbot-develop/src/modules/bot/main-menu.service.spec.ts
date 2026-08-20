import { MainMenuService } from './main-menu.service';
import { buildClientSession } from '../../test/factories/session.factory';

const makeConfig = (opciones: any[]) => ({
  Mensajes: { Bienvenida: 'Hola {nombre}, bienvenido', BienvenidaProspecto: 'Hola, bienvenido' },
  Menu: { TituloBoton: 'Ver opciones', TituloSeccion: 'Menú', Opciones: opciones },
});

describe('MainMenuService (PASO 6B + fix de persistencia)', () => {
  const botConfigCache = { getConfig: jest.fn() };
  const sender = { sendWithList: jest.fn(), send: jest.fn() };
  let service: MainMenuService;

  beforeEach(() => {
    jest.resetAllMocks();
    sender.sendWithList.mockResolvedValue(undefined);
    service = new MainMenuService(botConfigCache as any, sender as any);
  });

  it('sendWelcome arma la lista y la manda vía MessageSenderService.sendWithList (no directo a whatsapp)', async () => {
    botConfigCache.getConfig.mockResolvedValue(makeConfig([
      { Activa: true, SoloCliente: false, Intent: 'consulta_deuda', Numero: 1, Etiqueta: 'Mi deuda', Descripcion: 'Ver saldo' },
      { Activa: true, SoloCliente: false, Intent: 'sin_conexion', Numero: 2, Etiqueta: 'Soporte técnico', Descripcion: 'Reportar falla' },
    ]));
    const session = buildClientSession();

    await service.sendWelcome(session);

    expect(sender.sendWithList).toHaveBeenCalledTimes(1);
    const [sessArg, bodyArg, listArg] = sender.sendWithList.mock.calls[0];
    expect(sessArg).toBe(session);
    expect(typeof bodyArg).toBe('string');
    expect(listArg.sections[0].rows).toHaveLength(2);
    expect(listArg.sections[0].rows[0].id).toBe('consulta_deuda');
  });

  it('sendMenu usa el intro recibido, no el saludo de bienvenida', async () => {
    botConfigCache.getConfig.mockResolvedValue(makeConfig([
      { Activa: true, SoloCliente: false, Intent: 'consulta_deuda', Numero: 1, Etiqueta: 'Mi deuda' },
    ]));
    const session = buildClientSession();

    await service.sendMenu(session, 'No entendí bien, elegí una opción:');

    expect(sender.sendWithList).toHaveBeenCalledWith(
      session, 'No entendí bien, elegí una opción:', expect.any(Object),
    );
  });

  it('filtra opciones SoloCliente para prospectos (sin clientId)', async () => {
    botConfigCache.getConfig.mockResolvedValue(makeConfig([
      { Activa: true, SoloCliente: true,  Intent: 'consulta_deuda', Numero: 1, Etiqueta: 'Mi deuda' },
      { Activa: true, SoloCliente: false, Intent: 'consulta_planes', Numero: 2, Etiqueta: 'Planes' },
    ]));
    const session = buildClientSession({ clientId: null });

    await service.sendWelcome(session);

    const [, , listArg] = sender.sendWithList.mock.calls[0];
    expect(listArg.sections[0].rows).toEqual([
      expect.objectContaining({ id: 'consulta_planes' }),
    ]);
  });

  it('filtra opciones inactivas', async () => {
    botConfigCache.getConfig.mockResolvedValue(makeConfig([
      { Activa: false, SoloCliente: false, Intent: 'viejo', Numero: 1, Etiqueta: 'Ya no existe' },
      { Activa: true,  SoloCliente: false, Intent: 'consulta_planes', Numero: 2, Etiqueta: 'Planes' },
    ]));
    const session = buildClientSession();

    await service.sendWelcome(session);

    const [, , listArg] = sender.sendWithList.mock.calls[0];
    expect(listArg.sections[0].rows).toHaveLength(1);
    expect(listArg.sections[0].rows[0].id).toBe('consulta_planes');
  });

  it('deduplica ids repetidos con sufijo #Numero en vez de perder la opción', async () => {
    botConfigCache.getConfig.mockResolvedValue(makeConfig([
      { Activa: true, SoloCliente: false, Intent: 'consulta_deuda', Numero: 1, Etiqueta: 'Mi deuda' },
      { Activa: true, SoloCliente: false, Intent: 'consulta_deuda', Numero: 2, Etiqueta: 'Otra opción duplicada' },
    ]));
    const session = buildClientSession();

    await service.sendWelcome(session);

    const [, , listArg] = sender.sendWithList.mock.calls[0];
    const ids = listArg.sections[0].rows.map((r: any) => r.id);
    expect(ids).toEqual(['consulta_deuda', 'consulta_deuda#2']);
  });

  it('sin opciones activas, no llama a sendWithList', async () => {
    botConfigCache.getConfig.mockResolvedValue(makeConfig([]));
    const session = buildClientSession();

    await service.sendWelcome(session);

    expect(sender.sendWithList).not.toHaveBeenCalled();
  });

  it('reemplaza {nombre} en el saludo con el nombre real del cliente', async () => {
    botConfigCache.getConfig.mockResolvedValue(makeConfig([
      { Activa: true, SoloCliente: false, Intent: 'consulta_deuda', Numero: 1, Etiqueta: 'Mi deuda' },
    ]));
    const session = buildClientSession({ clientName: 'Juan Pérez' });

    await service.sendWelcome(session);

    const [, bodyArg] = sender.sendWithList.mock.calls[0];
    expect(bodyArg).toContain('Juan Pérez');
  });
});
