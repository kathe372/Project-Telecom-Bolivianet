const planRepoStub = { getActivePlans: jest.fn().mockResolvedValue([]) };

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GetInstallationSlotsTool } from './get-installation-slots.tool';
import { CreateInstallationTool } from './create-installation.tool';
import { CancelInstallationTool } from './cancel-installation.tool';
import { RescheduleInstallationTool } from './reschedule-installation.tool';
import { PLAN_REPOSITORY, INSTALLATION_REPOSITORY } from '../../client/sistema-api.interfaces';
import { SessionService } from '../../session/session.service';
import type { SessionData } from '../../session/session.service';
import { AdminSignalrNotifierService } from '../../notifications/admin-signalr-notifier.service';
import { InteractiveIdCodec } from '../intents/interactive-id.codec';

const makeSession = (overrides: Partial<SessionData> = {}): SessionData => ({
  phoneNumber:          '59171000000',
  clientId:             null,
  clientName:           null,
  clientStatus:         null,
  planId:               null,
  planName:             null,
  totalDebt:            0,
  tbnCode:              null,
  activeTicketId:       null,
  activeInstallationId: null,
  pendingAction:        null,
  pendingTechIssue:     null,
  pendingCsatTicketId:  null,
  isEscalated:          false,
  lastSentiment:        'neutral',
  angryCount:           0,
  lastLocation:         null,
  locationCapturedAt:   null,
  locationSource:       null,
  pendingImageId:       null,
  pendingImageCaption:  null,
  messages:             [],
  ...overrides,
});

const makeSlots = (count = 3) =>
  Array.from({ length: count }, (_, i) => ({
    Fecha:      `2026-06-0${i + 5}`,
    HoraInicio: '09:00',
    Disponibles: 2,
  }));

describe('GetInstallationSlotsTool — TC-BOT-01 a TC-BOT-04', () => {
  let tool: GetInstallationSlotsTool;
  let mockRepo: { getInstallationSlots: jest.Mock };
  let mockConfig: { get: jest.Mock };

  beforeEach(async () => {
    mockRepo   = { getInstallationSlots: jest.fn() };
    mockConfig = { get: jest.fn().mockReturnValue(7) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetInstallationSlotsTool,
        InteractiveIdCodec,
        { provide: ConfigService,          useValue: mockConfig },
        { provide: INSTALLATION_REPOSITORY, useValue: mockRepo },
        // 14a: la tool resuelve planes por nombre cuando el modelo fabrica el id.
        { provide: PLAN_REPOSITORY, useValue: planRepoStub },
      ],
    }).compile();

    tool = module.get<GetInstallationSlotsTool>(GetInstallationSlotsTool);
  });

  it('TC-BOT-01 — pasa plan_id del argumento al repositorio', async () => {
    const planId = '00000000-0000-0000-0001-000000000099';
    mockRepo.getInstallationSlots.mockResolvedValue(makeSlots(2));

    await tool.execute({ plan_id: planId }, makeSession());

    expect(mockRepo.getInstallationSlots).toHaveBeenCalledWith(7, planId);
  });

  it('TC-BOT-02 — usa plan_id de la sesión si el argumento no lo tiene', async () => {
    const sessionPlanId = '00000000-0000-0000-0001-000000000098';
    mockRepo.getInstallationSlots.mockResolvedValue(makeSlots(2));

    await tool.execute({}, makeSession({ planId: sessionPlanId }));

    expect(mockRepo.getInstallationSlots).toHaveBeenCalledWith(7, sessionPlanId);
  });

  it('TC-BOT-03 — devuelve available:true y lista de slots cuando hay disponibilidad', async () => {
    mockRepo.getInstallationSlots.mockResolvedValue(makeSlots(3));
    const result = await tool.execute({ plan_id: '00000000-0000-0000-0001-000000000099' }, makeSession()) as any;

    expect(result.available).toBe(true);
    expect(result.slotCount).toBe(3);
    expect(result.slots).toHaveLength(3);
  });

  it('TC-BOT-04 — devuelve available:false cuando no hay slots', async () => {
    mockRepo.getInstallationSlots.mockResolvedValue([]);
    const result = await tool.execute({ plan_id: '00000000-0000-0000-0001-000000000099' }, makeSession()) as any;

    expect(result.available).toBe(false);
    expect(result.message).toContain('No hay horarios');
  });

  // ── PASO 12: _list con InteractiveIdCodec ─────────────────────────────────

  it('PASO 12: siempre devuelve _list cuando hay slots disponibles', async () => {
    mockRepo.getInstallationSlots.mockResolvedValue(makeSlots(2));
    const result = await tool.execute({ plan_id: '00000000-0000-0000-0001-000000000099' }, makeSession()) as any;

    expect(result._list).toBeDefined();
    expect(result._list.sections[0].rows).toHaveLength(2);
  });

  it('PASO 12: codifica el id de cada fila como "slot:<fecha>:<hora>" vía InteractiveIdCodec', async () => {
    mockRepo.getInstallationSlots.mockResolvedValue([
      { Fecha: '2026-08-06', HoraInicio: '09:00', Disponibles: 3 },
    ]);
    const result = await tool.execute({ plan_id: '00000000-0000-0000-0001-000000000099' }, makeSession()) as any;

    expect(result._list.sections[0].rows[0].id).toBe('slot:2026-08-06:09:00');
  });

  it('PASO 12: recorta a máximo 10 slots (límite de lista de WhatsApp)', async () => {
    mockRepo.getInstallationSlots.mockResolvedValue(makeSlots(15));
    const result = await tool.execute({ plan_id: '00000000-0000-0000-0001-000000000099' }, makeSession()) as any;

    expect(result.slots).toHaveLength(10);
    expect(result._list.sections[0].rows).toHaveLength(10);
  });

  it('no expone "cupos disponibles" ni en la lista con botones ni en el JSON del agente', async () => {
    mockRepo.getInstallationSlots.mockResolvedValue([
      { Fecha: '2026-08-06', HoraInicio: '09:00', Disponibles: 7 },
    ]);
    const result = await tool.execute({ plan_id: '00000000-0000-0000-0001-000000000099' }, makeSession()) as any;

    expect(result._list.sections[0].rows[0].description).toBeUndefined();
    expect(result.slots[0]).toEqual({ date: '2026-08-06', time: '09:00' });
  });

  it('el título de cada horario incluye el día de la semana (2026-08-06 es jueves)', async () => {
    mockRepo.getInstallationSlots.mockResolvedValue([
      { Fecha: '2026-08-06', HoraInicio: '09:00', Disponibles: 7 },
    ]);
    const result = await tool.execute({ plan_id: '00000000-0000-0000-0001-000000000099' }, makeSession()) as any;

    expect(result._list.sections[0].rows[0].title).toBe('Jueves 06/08 09:00');
  });

  it('PASO 12: sin slots disponibles → sin _list', async () => {
    mockRepo.getInstallationSlots.mockResolvedValue([]);
    const result = await tool.execute({ plan_id: '00000000-0000-0000-0001-000000000099' }, makeSession()) as any;

    expect(result._list).toBeUndefined();
  });

  // ── P2.1 (auditoría 2026-08): mismo guard que create_installation/change_plan ──
  it('P2.1 — plan_id sin forma de UUID (inventado) → error claro, no llama al repo', async () => {
    const result = await tool.execute({ plan_id: 'plan_platinium' }, makeSession()) as any;

    expect(result.available).toBe(false);
    expect(result.error).toContain('plan_id inválido');
    expect(mockRepo.getInstallationSlots).not.toHaveBeenCalled();
  });

  it('P2.1 — sin plan_id ni en sesión → no dispara el guard (undefined es válido, deja pasar al repo)', async () => {
    mockRepo.getInstallationSlots.mockResolvedValue(makeSlots(1));
    const result = await tool.execute({}, makeSession()) as any;

    expect(result.available).toBe(true);
    expect(mockRepo.getInstallationSlots).toHaveBeenCalledWith(7, undefined);
  });

  // ── Auditoría 2026-08: selectedPlanId (decodificado del botón, no del LLM) ──
  it('usa selectedPlanId de sesión si el argumento no lo tiene', async () => {
    const selectedPlanId = '00000000-0000-0000-0001-000000000097';
    mockRepo.getInstallationSlots.mockResolvedValue(makeSlots(2));

    await tool.execute({}, makeSession({ selectedPlanId }));

    expect(mockRepo.getInstallationSlots).toHaveBeenCalledWith(7, selectedPlanId);
  });
});

describe('CancelInstallationTool — TC-BOT-05 a TC-BOT-08', () => {
  let tool: CancelInstallationTool;
  let mockRepo: any;
  let mockPlanRepo: { getActivePlans: jest.Mock };
  let mockSession: { updateSession: jest.Mock };

  beforeEach(async () => {
    mockRepo    = { cancelInstallation: jest.fn().mockResolvedValue(undefined) , findScheduledInstallationByPhone: jest.fn().mockResolvedValue(null)};
    mockSession = { updateSession:      jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CancelInstallationTool,
        { provide: INSTALLATION_REPOSITORY, useValue: mockRepo },
        // 14a: la tool resuelve planes por nombre cuando el modelo fabrica el id.
        { provide: PLAN_REPOSITORY, useValue: planRepoStub },
        { provide: SessionService,          useValue: mockSession },
      ],
    }).compile();

    tool = module.get<CancelInstallationTool>(CancelInstallationTool);
  });

  it('TC-BOT-05 — retorna error cuando no hay instalación activa en sesión', async () => {
    const result = await tool.execute({ motivo: 'cambio de planes' }, makeSession()) as any;

    expect(result.cancelled).toBe(false);
    expect(result.error).toContain('No hay ninguna instalación');
    expect(mockRepo.cancelInstallation).not.toHaveBeenCalled();
  });

  it('TC-BOT-06 — cancela instalación y limpia activeInstallationId de sesión', async () => {
    const session = makeSession({ activeInstallationId: 'inst-xyz', phoneNumber: '59171' });
    const result  = await tool.execute({ motivo: 'No puedo ese día', confirmado: true }, session) as any;

    expect(result.cancelled).toBe(true);
    expect(mockRepo.cancelInstallation).toHaveBeenCalledWith('inst-xyz', 'No puedo ese día');
    expect(mockSession.updateSession).toHaveBeenCalledWith('59171',
      expect.objectContaining({ activeInstallationId: undefined }));
  });

  it('TC-BOT-07 — error 422 del repo retorna mensaje sobre 2 horas de anticipación, con botón de agente', async () => {
    mockRepo.cancelInstallation.mockRejectedValue(
      Object.assign(new Error('2 horas'), { response: { status: 422 } }),
    );
    const result = await tool.execute(
      { motivo: 'urgente', confirmado: true },
      makeSession({ activeInstallationId: 'inst-abc' }),
    ) as any;

    expect(result.cancelled).toBe(false);
    expect(result.error).toContain('2 horas');
    expect(result._quickReplies).toEqual([{ id: 'solicitar_agente', title: '👤 Hablar con agente' }]);
  });

  it('TC-BOT-08 — usa motivo predeterminado cuando no se proporciona', async () => {
    await tool.execute({ confirmado: true }, makeSession({ activeInstallationId: 'inst-1' }));

    expect(mockRepo.cancelInstallation).toHaveBeenCalledWith('inst-1', 'Sin motivo especificado');
  });

  // ── PASO 13: confirmación en dos pasos ────────────────────────────────────

  it('PASO 13: sin confirmado → NO llama al backend, devuelve resumen con botones', async () => {
    const result = await tool.execute(
      { motivo: 'Cambio de planes' },
      makeSession({ activeInstallationId: 'inst-1' }),
    ) as any;

    expect(result.cancelled).toBe(false);
    expect(result.pending).toBe(true);
    expect(mockRepo.cancelInstallation).not.toHaveBeenCalled();
    expect(result._quickReplies).toEqual([
      { id: 'confirmar_cancelacion_instalacion', title: '✅ Confirmar cancelación' },
      { id: 'mantener_instalacion_agendada',     title: '❌ Cancelar' },
    ]);
  });

  it('PASO 13: confirmado=true → sí cancela', async () => {
    const result = await tool.execute(
      { motivo: 'Cambio de planes', confirmado: true },
      makeSession({ activeInstallationId: 'inst-1' }),
    ) as any;

    expect(result.cancelled).toBe(true);
    expect(mockRepo.cancelInstallation).toHaveBeenCalledTimes(1);
  });

  it('PASO 13: sin instalación activa → error incluso sin confirmado (no llega al resumen)', async () => {
    const result = await tool.execute({ motivo: 'x' }, makeSession()) as any;

    expect(result.pending).toBeUndefined();
    expect(result.error).toContain('No hay ninguna instalación');
  });
});

describe('RescheduleInstallationTool — TC-BOT-09 a TC-BOT-14', () => {
  let tool: RescheduleInstallationTool;
  let mockRepo: any;

  beforeEach(async () => {
    mockRepo = { rescheduleInstallation: jest.fn().mockResolvedValue(undefined) , findScheduledInstallationByPhone: jest.fn().mockResolvedValue(null)};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RescheduleInstallationTool,
        { provide: INSTALLATION_REPOSITORY, useValue: mockRepo },
        // 14a: la tool resuelve planes por nombre cuando el modelo fabrica el id.
        { provide: PLAN_REPOSITORY, useValue: planRepoStub },
      ],
    }).compile();

    tool = module.get<RescheduleInstallationTool>(RescheduleInstallationTool);
  });

  it('TC-BOT-09 — retorna error cuando no hay instalación activa', async () => {
    const result = await tool.execute(
      { nueva_fecha: '2026-06-15', nueva_hora: '10:00' },
      makeSession(),
    ) as any;

    expect(result.rescheduled).toBe(false);
    expect(result.error).toContain('No hay ninguna instalación');
    expect(mockRepo.rescheduleInstallation).not.toHaveBeenCalled();
  });

  it('TC-BOT-10 — reprograma correctamente y devuelve nuevos datos', async () => {
    const session = makeSession({ activeInstallationId: 'inst-reprog' });
    const result  = await tool.execute(
      { nueva_fecha: '2026-06-20', nueva_hora: '14:00', motivo: 'Viaje', confirmado: true },
      session,
    ) as any;

    expect(result.rescheduled).toBe(true);
    expect(result.nuevaFecha).toBe('2026-06-20');
    expect(result.nuevaHora).toBe('14:00');
    expect(mockRepo.rescheduleInstallation).toHaveBeenCalledWith(
      'inst-reprog', '2026-06-20', '14:00', 'Viaje',
    );
  });

  it('TC-BOT-11 — retorna error cuando la fecha no es YYYY-MM-DD', async () => {
    const result = await tool.execute(
      { nueva_fecha: '15/06/2026', nueva_hora: '10:00' },
      makeSession({ activeInstallationId: 'inst-1' }),
    ) as any;

    expect(result.rescheduled).toBe(false);
    expect(result.error).toContain('Formato de fecha');
    expect(mockRepo.rescheduleInstallation).not.toHaveBeenCalled();
  });

  it('TC-BOT-12 — retorna error cuando la hora no es HH:mm', async () => {
    const result = await tool.execute(
      { nueva_fecha: '2026-06-15', nueva_hora: '14h' },
      makeSession({ activeInstallationId: 'inst-1' }),
    ) as any;

    expect(result.rescheduled).toBe(false);
    expect(result.error).toContain('Formato de hora');
  });

  it('TC-BOT-13 — propaga error del repositorio con mensaje descriptivo', async () => {
    mockRepo.rescheduleInstallation.mockRejectedValue(new Error('Slot no disponible'));
    const result = await tool.execute(
      { nueva_fecha: '2026-06-20', nueva_hora: '09:00', confirmado: true },
      makeSession({ activeInstallationId: 'inst-2' }),
    ) as any;

    expect(result.rescheduled).toBe(false);
    expect(result.error).toContain('Slot no disponible');
  });

  it('TC-BOT-14 — reprograma sin motivo cuando no se proporciona', async () => {
    await tool.execute(
      { nueva_fecha: '2026-06-25', nueva_hora: '11:00', confirmado: true },
      makeSession({ activeInstallationId: 'inst-3' }),
    );

    expect(mockRepo.rescheduleInstallation).toHaveBeenCalledWith(
      'inst-3', '2026-06-25', '11:00', undefined,
    );
  });

  // ── PASO 13: confirmación en dos pasos ────────────────────────────────────

  it('PASO 13: sin confirmado → NO llama al backend, devuelve resumen con botones', async () => {
    const result = await tool.execute(
      { nueva_fecha: '2026-06-20', nueva_hora: '14:00' },
      makeSession({ activeInstallationId: 'inst-reprog' }),
    ) as any;

    expect(result.rescheduled).toBe(false);
    expect(result.pending).toBe(true);
    expect(mockRepo.rescheduleInstallation).not.toHaveBeenCalled();
    expect(result._quickReplies).toEqual([
      { id: 'confirmar_reprogramacion_instalacion', title: '✅ Confirmar reprogramación' },
      { id: 'cancelar_reprogramacion_instalacion',  title: '❌ Cancelar' },
    ]);
  });

  it('PASO 13: confirmado=false explícito → mismo comportamiento que omitido', async () => {
    const result = await tool.execute(
      { nueva_fecha: '2026-06-20', nueva_hora: '14:00', confirmado: false },
      makeSession({ activeInstallationId: 'inst-reprog' }),
    ) as any;

    expect(result.pending).toBe(true);
    expect(mockRepo.rescheduleInstallation).not.toHaveBeenCalled();
  });
});

describe('Tool metadata — TC-BOT-15 a TC-BOT-17', () => {
  it('TC-BOT-15 — CancelInstallationTool.getName() = "cancel_installation"', async () => {
    const module = await Test.createTestingModule({
      providers: [
        CancelInstallationTool,
        { provide: INSTALLATION_REPOSITORY, useValue: { cancelInstallation: jest.fn() , findScheduledInstallationByPhone: jest.fn().mockResolvedValue(null)} },
        { provide: SessionService,          useValue: { updateSession: jest.fn() } },
      ],
    }).compile();
    expect(module.get(CancelInstallationTool).getName()).toBe('cancel_installation');
  });

  it('TC-BOT-16 — RescheduleInstallationTool.getName() = "reschedule_installation"', async () => {
    const module = await Test.createTestingModule({
      providers: [
        RescheduleInstallationTool,
        { provide: INSTALLATION_REPOSITORY, useValue: { rescheduleInstallation: jest.fn() , findScheduledInstallationByPhone: jest.fn().mockResolvedValue(null)} },
      ],
    }).compile();
    expect(module.get(RescheduleInstallationTool).getName()).toBe('reschedule_installation');
  });

  it('TC-BOT-17 — GetInstallationSlotsTool declaration incluye plan_id en required', async () => {
    const module = await Test.createTestingModule({
      providers: [
        GetInstallationSlotsTool,
        InteractiveIdCodec,
        { provide: ConfigService,           useValue: { get: jest.fn() } },
        { provide: INSTALLATION_REPOSITORY, useValue: { getInstallationSlots: jest.fn() } },
        { provide: PLAN_REPOSITORY,         useValue: planRepoStub },
      ],
    }).compile();
    const decl = module.get(GetInstallationSlotsTool).getDeclaration() as any;
    expect(decl.parameters.required).toContain('plan_id');
  });
});

describe('CreateInstallationTool — identidad del prospecto (Fase 1 nivel comercial)', () => {
  const PLAN_UUID = '00000000-0000-0000-0001-000000000002';
  let tool: CreateInstallationTool;
  let mockRepo: { createInstallation: jest.Mock };
  let mockPlanRepo: { getActivePlans: jest.Mock };
  let mockSession: { updateSession: jest.Mock };
  let mockNotifier: { notifyTicketCreated: jest.Mock };

  beforeEach(async () => {
    mockRepo = {
      createInstallation: jest.fn().mockResolvedValue({ InstalacionId: 'inst-1', TicketId: 'tk-1' }),
    };
    mockPlanRepo = { getActivePlans: jest.fn().mockResolvedValue([
      { Id: PLAN_UUID, Name: 'PLATA', SpeedMbps: 50, PriceMonthly: 149 },
    ]) };
    mockSession  = { updateSession:       jest.fn().mockResolvedValue(undefined) };
    mockNotifier = { notifyTicketCreated: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateInstallationTool,
        { provide: INSTALLATION_REPOSITORY,      useValue: mockRepo },
        // C4 (2026-08-07): la tool ahora consulta los planes para poder incluir
        // nombre y precio en el resumen de confirmación.
        { provide: PLAN_REPOSITORY,              useValue: mockPlanRepo },
        { provide: SessionService,               useValue: mockSession },
        { provide: AdminSignalrNotifierService,  useValue: mockNotifier },
      ],
    }).compile();

    tool = module.get<CreateInstallationTool>(CreateInstallationTool);
  });

  const validArgs = {
    fecha: '2026-08-10', hora: '10:00', direccion: 'Av. Blanco Galindo km 4',
    plan_id: PLAN_UUID, confirmado: true, telefono_respaldo: '70000001',
  };

  it('TC-BOT-18 — prospecto: envía ProspectName (de nombre_contacto), ProspectPhone (de sesión), ProspectIdentityCard y ProspectBackupPhone', async () => {
    const session = makeSession({ phoneNumber: '59171435981' });
    const result  = await tool.execute(
      { ...validArgs, nombre_contacto: 'Juan Pérez', ci_prospecto: '7654321 LP' }, session) as any;

    expect(result.created).toBe(true);
    expect(mockRepo.createInstallation).toHaveBeenCalledWith(
      expect.objectContaining({
        ClienteId:            null,
        ProspectName:         'Juan Pérez',
        ProspectPhone:        '59171435981',
        ProspectIdentityCard: '7654321 LP',
        ProspectBackupPhone:  '70000001',
      }));
  });

  it('TC-BOT-19 — cliente registrado: NO envía identidad de prospecto', async () => {
    const session = makeSession({ clientId: 'client-1', clientName: 'María Cliente' });
    await tool.execute(validArgs, session);

    expect(mockRepo.createInstallation).toHaveBeenCalledWith(
      expect.objectContaining({
        ClienteId:            'client-1',
        ProspectName:         undefined,
        ProspectPhone:        undefined,
        ProspectIdentityCard: undefined,
        ProspectBackupPhone:  undefined,
      }));
  });

  it('TC-BOT-20 — GPS de la sesión se envía en el payload', async () => {
    const session = makeSession({
      lastLocation:   { lat: -17.3895, lng: -66.1568 },
      locationSource: 'whatsapp_gps',
    });
    await tool.execute({ ...validArgs, nombre_contacto: 'Ana', ci_prospecto: '1234567' }, session);

    expect(mockRepo.createInstallation).toHaveBeenCalledWith(
      expect.objectContaining({
        GpsLatitude:    -17.3895,
        GpsLongitude:   -66.1568,
        LocationSource: 'whatsapp_gps',
      }));
  });

  it('TC-BOT-21 — prospecto sin nombre_contacto: usa clientName de sesión como fallback', async () => {
    const session = makeSession({ clientName: 'Nombre Sesión' });
    await tool.execute({ ...validArgs, ci_prospecto: '1234567' }, session);

    expect(mockRepo.createInstallation).toHaveBeenCalledWith(
      expect.objectContaining({ ProspectName: 'Nombre Sesión' }));
  });

  it('TC-BOT-22 — declaration incluye nombre_contacto y ci_prospecto como parámetros', () => {
    const decl = tool.getDeclaration() as any;
    expect(decl.parameters.properties.nombre_contacto).toBeDefined();
    expect(decl.parameters.properties.ci_prospecto).toBeDefined();
  });

  // ── PASO 10: CI obligatoria para prospectos (validación del lado del chatbot) ──

  it('PASO 10: prospecto sin ci_prospecto → error, no llama al backend', async () => {
    const session = makeSession();
    const result = await tool.execute(
      { ...validArgs, nombre_contacto: 'Juan Pérez' }, session) as any;

    expect(result.created).toBe(false);
    expect(result.error).toContain('cédula');
    expect(mockRepo.createInstallation).not.toHaveBeenCalled();
  });

  it('PASO 10: prospecto sin nombre_contacto → error, no llama al backend', async () => {
    const session = makeSession();
    const result = await tool.execute(
      { ...validArgs, ci_prospecto: '1234567' }, session) as any;

    expect(result.created).toBe(false);
    expect(result.error).toContain('nombre');
    expect(mockRepo.createInstallation).not.toHaveBeenCalled();
  });

  it('PASO 10: prospecto sin telefono_respaldo → error, no llama al backend', async () => {
    const session = makeSession();
    const { telefono_respaldo, ...argsSinRespaldo } = validArgs;
    const result = await tool.execute(
      { ...argsSinRespaldo, nombre_contacto: 'Juan Pérez', ci_prospecto: '1234567' }, session) as any;

    expect(result.created).toBe(false);
    expect(result.error).toContain('teléfono');
    expect(mockRepo.createInstallation).not.toHaveBeenCalled();
  });

  it('PASO 10: cliente registrado sin ci_prospecto → no falla (no aplica)', async () => {
    const session = makeSession({ clientId: 'client-1', clientName: 'María Cliente' });
    const result = await tool.execute(validArgs, session) as any;

    expect(result.created).toBe(true);
  });

  // ── Auditoría 2026-08: selectedPlanId de sesión (decodificado del botón,
  // no del LLM) gana sobre un plan_id inventado por el modelo ──────────────

  describe('selectedPlanId de sesión vs. plan_id del modelo', () => {
    const SELECTED = '00000000-0000-0000-0001-000000000097';
    // Cliente registrado: evita las validaciones de identidad de prospecto,
    // no relevantes para estos casos (foco en la resolución de plan_id).
    const clientSession = (overrides: Partial<SessionData> = {}) =>
      makeSession({ clientId: 'client-1', clientName: 'María Cliente', ...overrides });

    it('usa selectedPlanId de sesión si el argumento no manda plan_id', async () => {
      const session = clientSession({ selectedPlanId: SELECTED });
      await tool.execute(
        { fecha: '2026-08-10', hora: '10:00', direccion: 'Calle X', confirmado: true }, session);

      expect(mockRepo.createInstallation).toHaveBeenCalledWith(
        expect.objectContaining({ PlanId: SELECTED }));
    });

    it('plan_id del modelo NO coincide con selectedPlanId de sesión → gana la sesión', async () => {
      const session = clientSession({ selectedPlanId: SELECTED });
      const result = await tool.execute(
        { ...validArgs, plan_id: 'plan-cobre-123' }, session) as any;

      expect(result.created).toBe(true);
      expect(mockRepo.createInstallation).toHaveBeenCalledWith(
        expect.objectContaining({ PlanId: SELECTED }));
    });

    it('plan_id del modelo SÍ coincide con selectedPlanId de sesión → se usa tal cual', async () => {
      const session = clientSession({ selectedPlanId: SELECTED });
      await tool.execute({ ...validArgs, plan_id: SELECTED }, session);

      expect(mockRepo.createInstallation).toHaveBeenCalledWith(
        expect.objectContaining({ PlanId: SELECTED }));
    });

    it('agenda con éxito → limpia selectedPlanId de sesión', async () => {
      const session = clientSession({ selectedPlanId: SELECTED });
      await tool.execute({ ...validArgs, plan_id: SELECTED }, session);

      expect(mockSession.updateSession).toHaveBeenCalledWith(
        session.phoneNumber, expect.objectContaining({ selectedPlanId: null }));
    });
  });

  // ── datos de prospecto guardados con save_prospect_data (fix bucle nombre/CI/dirección) ──

  describe('fallback a datos guardados con save_prospect_data', () => {
    it('sin nombre_contacto/ci_prospecto/direccion en el llamado → los recupera de la sesión', async () => {
      const session = makeSession({
        prospectName: 'Jhael Katherine Arce Chavez',
        prospectIdentityCard: '8041022',
        prospectAddress: 'La Huerta',
        prospectBackupPhone: '70000002',
      });
      const result = await tool.execute(
        { fecha: '2026-08-10', hora: '10:00', plan_id: PLAN_UUID, confirmado: true }, session) as any;

      expect(result.created).toBe(true);
      expect(mockRepo.createInstallation).toHaveBeenCalledWith(
        expect.objectContaining({
          ProspectName:         'Jhael Katherine Arce Chavez',
          ProspectIdentityCard: '8041022',
          Direccion:            'La Huerta',
          ProspectBackupPhone:  '70000002',
        }));
    });

    it('argumentos explícitos del llamado tienen prioridad sobre lo guardado en sesión', async () => {
      const session = makeSession({ prospectName: 'Nombre Viejo', prospectIdentityCard: '111' });
      await tool.execute(
        { ...validArgs, nombre_contacto: 'Nombre Nuevo', ci_prospecto: '222' }, session);

      expect(mockRepo.createInstallation).toHaveBeenCalledWith(
        expect.objectContaining({ ProspectName: 'Nombre Nuevo', ProspectIdentityCard: '222' }));
    });

    it('al agendar con éxito (confirmado=true), limpia los datos guardados de la sesión', async () => {
      const session = makeSession({
        prospectName: 'Jhael', prospectIdentityCard: '8041022', prospectAddress: 'La Huerta',
        plansShown: true,
      });
      await tool.execute(
        { ...validArgs, nombre_contacto: 'Jhael', ci_prospecto: '8041022' }, session);

      expect(mockSession.updateSession).toHaveBeenCalledWith(session.phoneNumber, expect.objectContaining({
        prospectName: null, prospectIdentityCard: null, prospectAddress: null, plansShown: false,
      }));
    });

    it('en el resumen sin confirmar (confirmado=false), NO limpia los datos guardados todavía', async () => {
      const session = makeSession({ prospectName: 'Jhael', prospectIdentityCard: '8041022' });
      await tool.execute(
        { fecha: '2026-08-10', hora: '10:00', direccion: 'La Huerta', plan_id: PLAN_UUID,
          nombre_contacto: 'Jhael', ci_prospecto: '8041022' },
        session,
      );

      expect(mockSession.updateSession).not.toHaveBeenCalled();
    });
  });

  describe('mensaje de error real del backend (no el genérico de axios)', () => {
    it('usa err.response.data.message cuando el backend lo manda (ej. plan inexistente)', async () => {
      mockRepo.createInstallation.mockRejectedValueOnce(
        Object.assign(new Error('Request failed with status code 400'), {
          response: { data: { success: false, message: 'El plan seleccionado no existe o está inactivo.' } },
        }));
      const session = makeSession();
      const result = await tool.execute(
        { ...validArgs, nombre_contacto: 'Jhael', ci_prospecto: '8041022' }, session) as any;

      expect(result.created).toBe(false);
      expect(result.error).toContain('El plan seleccionado no existe o está inactivo.');
      expect(result.error).not.toContain('status code 400');
    });

    it('si el backend no manda message, cae al err.message genérico', async () => {
      mockRepo.createInstallation.mockRejectedValueOnce(new Error('Network Error'));
      const session = makeSession();
      const result = await tool.execute(
        { ...validArgs, nombre_contacto: 'Jhael', ci_prospecto: '8041022' }, session) as any;

      expect(result.error).toContain('Network Error');
    });
  });

  // ── PASO 12: confirmación en dos pasos ────────────────────────────────────

  describe('confirmación en dos pasos', () => {
    it('PASO 12: sin confirmado → NO llama al backend, devuelve resumen con botones', async () => {
      const session = makeSession({ clientId: 'client-1' });
      const result = await tool.execute(
        { fecha: '2026-08-10', hora: '10:00', direccion: 'Av. Blanco Galindo km 4', plan_id: PLAN_UUID },
        session,
      ) as any;

      expect(result.created).toBe(false);
      expect(result.pending).toBe(true);
      expect(mockRepo.createInstallation).not.toHaveBeenCalled();
      expect(result._quickReplies).toEqual([
        { id: 'confirmar_nueva_instalacion', title: '✅ Confirmar' },
        { id: 'cambiar_nueva_instalacion',   title: '✏️ Cambiar' },
        { id: 'cancelar_nueva_instalacion',  title: '❌ Cancelar' },
      ]);
    });

    it('PASO 12: confirmado=false explícito → mismo comportamiento que omitido', async () => {
      const session = makeSession({ clientId: 'client-1' });
      const result = await tool.execute(
        { ...validArgs, confirmado: false }, session,
      ) as any;

      expect(result.pending).toBe(true);
      expect(mockRepo.createInstallation).not.toHaveBeenCalled();
    });

    it('PASO 12: confirmado=true → sí llama al backend y agenda', async () => {
      const session = makeSession({ clientId: 'client-1' });
      const result = await tool.execute(validArgs, session) as any;

      expect(result.created).toBe(true);
      expect(mockRepo.createInstallation).toHaveBeenCalledTimes(1);
    });

    it('PASO 12: sin confirmado, faltando CI de un prospecto → error de validación, ni siquiera llega al resumen', async () => {
      const session = makeSession();
      const result = await tool.execute(
        { fecha: '2026-08-10', hora: '10:00', direccion: 'Av. Blanco Galindo km 4', plan_id: PLAN_UUID, nombre_contacto: 'Juan' },
        session,
      ) as any;

      expect(result.created).toBe(false);
      expect(result.pending).toBeUndefined();
      expect(result.error).toContain('cédula');
    });
  });
});
