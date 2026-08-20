import { Test } from '@nestjs/testing';
import { INSTALLATION_REPOSITORY } from '../../client/sistema-api.interfaces';
import { SessionData } from '../../session/session.service';
import { GetActiveInstallationTool } from './get-active-installation.tool';

/**
 * FASE G5 — HALLAZGO 23.
 *
 * En producción el bot respondió "tu instalación es a las 10:20" cuando estaba
 * agendada 12:20: había usado el vencimiento del SLA del ticket asociado. No
 * existía ninguna herramienta que devolviera la cita, así que el modelo usó la
 * única hora que tenía a mano.
 */
describe('GetActiveInstallationTool (G5)', () => {
  let tool: GetActiveInstallationTool;
  const mockRepo = {
    getInstallationById: jest.fn(),
    findScheduledInstallationId: jest.fn(),
    findScheduledInstallationByPhone: jest.fn(),
  };

  const sesion = (id: string | null): SessionData =>
    ({ phoneNumber: '59171000001', activeInstallationId: id }) as any;

  const instalacion = (extra: Record<string, unknown> = {}) => ({
    Id: 'ins-1', Fecha: '2026-08-11', HoraInicio: '12:20', HoraFin: '14:20',
    Status: 'Pendiente', Direccion: 'Av. Siempre Viva 742',
    PlanNombre: 'COBRE', TecnicoNombre: 'Juan Pérez', ...extra,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        GetActiveInstallationTool,
        { provide: INSTALLATION_REPOSITORY, useValue: mockRepo },
      ],
    }).compile();
    tool = mod.get(GetActiveInstallationTool);
  });

  it('devuelve la hora AGENDADA, no ninguna otra', async () => {
    mockRepo.getInstallationById.mockResolvedValue(instalacion());

    const r: any = await tool.execute({}, sesion('ins-1'));

    expect(mockRepo.getInstallationById).toHaveBeenCalledWith('ins-1');
    expect(r.found).toBe(true);
    expect(r.vigente).toBe(true);
    expect(r.hora_agendada).toBe('12:20');   // la cita
    expect(r.fecha_agendada).toBe('2026-08-11');
    expect(r.tecnico).toBe('Juan Pérez');
    expect(r.plan).toBe('COBRE');
  });

  it('la declaración prohíbe explícitamente usar get_active_ticket para la hora', () => {
    const d = tool.getDeclaration() as any;
    expect(d.name).toBe('get_active_installation');
    expect(d.description).toMatch(/NUNCA uses get_active_ticket/);
  });

  it('un prospecto sin cuenta puede consultarla (el id vive en la sesión)', () => {
    expect(tool.requiresIdentification()).toBe(false);
  });

  it('sin instalación en sesión NO inventa: pide escalar', async () => {
    const r: any = await tool.execute({}, sesion(null));

    expect(mockRepo.getInstallationById).not.toHaveBeenCalled();
    expect(r.found).toBe(false);
    expect(r.nota_para_el_agente).toMatch(/No inventes/i);
  });

  it('si el backend ya no la tiene (404 → null) tampoco inventa', async () => {
    mockRepo.getInstallationById.mockResolvedValue(null);

    const r: any = await tool.execute({}, sesion('ins-borrada'));

    expect(r.found).toBe(false);
    expect(r.nota_para_el_agente).toMatch(/No inventes/i);
  });

  it.each(['Cancelada', 'Completada', 'NoRealizada'])(
    'una instalación %s no se anuncia como cita próxima',
    async (estado) => {
      mockRepo.getInstallationById.mockResolvedValue(instalacion({ Status: estado }));

      const r: any = await tool.execute({}, sesion('ins-1'));

      expect(r.found).toBe(true);
      expect(r.vigente).toBe(false);
      expect(r.nota_para_el_agente).toMatch(/no está vigente/i);
    },
  );

  it('un fallo del backend se reporta como error, no como "no hay instalación"', async () => {
    mockRepo.getInstallationById.mockRejectedValue(new Error('ECONNREFUSED'));

    const r: any = await tool.execute({}, sesion('ins-1'));

    // Distinguir "falló la consulta" de "no tiene instalación" es justo lo que
    // el sistema no hacía: fallar en silencio se narraba como un hecho.
    expect(r.error).toMatch(/ECONNREFUSED/);
    expect(r.found).toBeUndefined();
  });

  // ── Fallback cuando la sesión de Redis ya caducó ───────────────────────────
  // El caso más común de esta pregunta no es el mismo día que agendó: es al día
  // siguiente. Para entonces `activeInstallationId` ya no está en la sesión.
  describe('G5 — cliente identificado sin instalación en sesión', () => {
    it('busca la instalación vigente en el backend en vez de negarla', async () => {
      mockRepo.findScheduledInstallationId.mockResolvedValue('ins-9');
      mockRepo.getInstallationById.mockResolvedValue(instalacion({ Id: 'ins-9' }));

      const r: any = await tool.execute({}, { phoneNumber: '59171000001', activeInstallationId: null, clientId: 'c-1' } as any);

      expect(mockRepo.findScheduledInstallationId).toHaveBeenCalledWith('c-1');
      expect(mockRepo.getInstallationById).toHaveBeenCalledWith('ins-9');
      expect(r.hora_agendada).toBe('12:20');
    });

    it('si el cliente no tiene ninguna vigente, responde que no hay — sin inventar', async () => {
      mockRepo.findScheduledInstallationId.mockResolvedValue(null);

      const r: any = await tool.execute({}, { phoneNumber: '59171000001', activeInstallationId: null, clientId: 'c-1' } as any);

      expect(r.found).toBe(false);
      expect(mockRepo.getInstallationById).not.toHaveBeenCalled();
    });

    it('un prospecto (sin clientId) ni siquiera intenta la búsqueda', async () => {
      const r: any = await tool.execute({}, { phoneNumber: '59171000001', activeInstallationId: null } as any);

      expect(mockRepo.findScheduledInstallationId).not.toHaveBeenCalled();
      expect(r.found).toBe(false);
    });

    it('si la búsqueda falla, degrada a "no hay" en vez de romper el turno', async () => {
      mockRepo.findScheduledInstallationId.mockRejectedValue(new Error('500'));

      const r: any = await tool.execute({}, { phoneNumber: '59171000001', activeInstallationId: null, clientId: 'c-1' } as any);

      expect(r.found).toBe(false);
    });
  });


  // Los estados los define el backend en
  // Domain/Entities/Installations/Installation.cs (InstallationStatus).
  // Este bloque existe porque ya nos pasó: el fixture usaba 'Programada', que
  // no es ninguno de los seis valores reales.
  describe('G5 — estados alineados con el enum del backend', () => {
    const ABIERTOS  = ['Pendiente', 'EnProceso', 'Reprogramada'];
    const CERRADOS  = ['Completada', 'Cancelada', 'NoRealizada'];

    it.each(ABIERTOS)('%s cuenta como cita vigente', async (estado) => {
      mockRepo.getInstallationById.mockResolvedValue(instalacion({ Status: estado }));
      const r: any = await tool.execute({}, sesion('ins-1'));
      expect(r.vigente).toBe(true);
      expect(r.estado).not.toBe(estado);   // tiene etiqueta propia, no cae al crudo
    });

    it.each(CERRADOS)('%s NO cuenta como cita vigente', async (estado) => {
      mockRepo.getInstallationById.mockResolvedValue(instalacion({ Status: estado }));
      const r: any = await tool.execute({}, sesion('ins-1'));
      expect(r.vigente).toBe(false);
    });

    it('un estado desconocido se muestra crudo, nunca se inventa una etiqueta', async () => {
      mockRepo.getInstallationById.mockResolvedValue(instalacion({ Status: 'EstadoNuevo' }));
      const r: any = await tool.execute({}, sesion('ins-1'));
      expect(r.estado).toBe('EstadoNuevo');
    });
  });


  // Medido en produccion (2026-08-07): a un PROSPECTO con instalacion vigente
  // el bot le dijo "no tenes ninguna instalacion agendada". La busqueda solo
  // corria para clientes (por clientId), y la instalacion de un prospecto se
  // guarda con ProspectPhone. Nadie consultaba por telefono.
  //
  // Misma causa que el duplicado que aparecia recien al confirmar: el backend
  // lo sabia, el chatbot no podia preguntarlo.
  describe('prospecto: busqueda por telefono', () => {
    it('encuentra la instalacion de un prospecto por su telefono', async () => {
      mockRepo.findScheduledInstallationByPhone.mockResolvedValue('ins-prospecto');
      mockRepo.getInstallationById.mockResolvedValue(instalacion({ Id: 'ins-prospecto' }));

      const r: any = await tool.execute({}, {
        phoneNumber: '64638535', activeInstallationId: null,
      } as any);

      expect(mockRepo.findScheduledInstallationByPhone).toHaveBeenCalledWith('64638535');
      expect(mockRepo.findScheduledInstallationId).not.toHaveBeenCalled();
      expect(r.found).toBe(true);
    });

    it('un cliente identificado sigue buscando por clientId', async () => {
      mockRepo.findScheduledInstallationId.mockResolvedValue('ins-cliente');
      mockRepo.getInstallationById.mockResolvedValue(instalacion({ Id: 'ins-cliente' }));

      await tool.execute({}, {
        phoneNumber: '71435981', activeInstallationId: null, clientId: 'c-1',
      } as any);

      expect(mockRepo.findScheduledInstallationId).toHaveBeenCalledWith('c-1');
      expect(mockRepo.findScheduledInstallationByPhone).not.toHaveBeenCalled();
    });

    it('si el prospecto no tiene ninguna, lo dice sin inventar', async () => {
      mockRepo.findScheduledInstallationByPhone.mockResolvedValue(null);

      const r: any = await tool.execute({}, {
        phoneNumber: '64638535', activeInstallationId: null,
      } as any);

      expect(r.found).toBe(false);
      expect(mockRepo.getInstallationById).not.toHaveBeenCalled();
    });
  });

});
