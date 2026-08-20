import { BotConfigCacheService } from './bot-config-cache.service';

function make(repoImpl: () => Promise<any>) {
  const repo = { getBotConfigPublic: jest.fn(repoImpl) };
  return { svc: new BotConfigCacheService(repo as any), repo };
}

describe('BotConfigCacheService', () => {
  it('normaliza un config completo del backend', async () => {
    const { svc } = make(async () => ({
      Menu: { TituloMenu: 'Menú X', TituloBoton: 'Ver', TituloSeccion: 'Sec',
        Opciones: [{ Numero: 1, Etiqueta: 'Deuda', Intent: 'CONSULTA_DEUDA', Activa: true, Descripcion: 'd', SoloCliente: true }] },
      Horario: { HoraInicio: '09:00', HoraFin: '18:00', DiasActivos: [true,true,true,true,true,true,false], MensajeFueraHorario: 'cerrado' },
      Mensajes: { Bienvenida: 'Hola B', BienvenidaProspecto: 'Hola P', NoEntendido: 'ND', EscaladoAgente: 'ESC' },
    }));
    const cfg = await svc.forceRefresh();
    expect(cfg.Menu.TituloMenu).toBe('Menú X');
    expect(cfg.Menu.Opciones[0].Numero).toBe('1'); // normalizado a String
    expect(cfg.Horario.HoraInicio).toBe('09:00');
    expect(cfg.Mensajes.Bienvenida).toBe('Hola B');
  });

  it('rellena defaults cuando el backend manda campos vacíos', async () => {
    const { svc } = make(async () => ({ Menu: {}, Horario: {}, Mensajes: {} }));
    const cfg = await svc.forceRefresh();
    expect(cfg.Menu.TituloMenu).toContain('ayudarte');            // default
    expect(cfg.Menu.Opciones.length).toBeGreaterThan(0);          // default opciones
    expect(cfg.Horario.HoraInicio).toBe('08:00');                 // default
    expect(cfg.Mensajes.NoEntendido).toContain('No entendí');     // default
  });

  it('si Opciones no es arreglo → usa las opciones por defecto', async () => {
    const { svc } = make(async () => ({ Menu: { Opciones: 'no-es-array' }, Horario: {}, Mensajes: {} }));
    const cfg = await svc.forceRefresh();
    expect(Array.isArray(cfg.Menu.Opciones)).toBe(true);
    expect(cfg.Menu.Opciones.length).toBe(6);
  });

  it('backend devuelve null → mantiene DEFAULT', async () => {
    const { svc } = make(async () => null);
    const cfg = await svc.forceRefresh();
    expect(cfg.Menu.TituloMenu).toContain('ayudarte');
  });

  it('backend falla sin caché previa → DEFAULT (no rompe)', async () => {
    const { svc } = make(async () => { throw new Error('backend caído'); });
    const cfg = await svc.forceRefresh();
    expect(cfg.Menu.Opciones.length).toBe(6);
    expect(cfg.Mensajes.EscaladoAgente).toBeTruthy();
  });

  it('getConfig no re-consulta el backend dentro del TTL', async () => {
    const { svc, repo } = make(async () => ({ Menu: {}, Horario: {}, Mensajes: {} }));
    await svc.getConfig();            // 1ª: consulta (lastFetch=0)
    const calls = repo.getBotConfigPublic.mock.calls.length;
    await svc.getConfig();            // 2ª: dentro del TTL → sin consulta
    expect(repo.getBotConfigPublic.mock.calls.length).toBe(calls);
  });
});
