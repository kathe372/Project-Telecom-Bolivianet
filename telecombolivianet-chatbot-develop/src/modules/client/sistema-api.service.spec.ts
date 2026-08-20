import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SistemaApiService } from './sistema-api.service';
import { RETRY_POLICY } from '../../common/resilience/retry-policy.interface';


const mockGet  = jest.fn();
const mockPost = jest.fn();
const mockPatch = jest.fn();
const mockPut  = jest.fn();

const mockRequest = jest.fn();

const mockHttpInstance = {
  get:          mockGet,
  post:         mockPost,
  patch:        mockPatch,
  put:          mockPut,
  request:      mockRequest,
  interceptors: {
    request:  { use: jest.fn() },
    response: { use: jest.fn() },
  },
};

jest.mock('axios', () => ({
  create: jest.fn(() => mockHttpInstance),
  post:   jest.fn(),
  default: {
    create: jest.fn(() => mockHttpInstance),
    post:   jest.fn(),
  },
}));

const configMock = {
  get: jest.fn((key: string) => {
    const cfg: Record<string, unknown> = {
      'sistema.apiUrl':                'http://backend:5000',
      'sistema.botEmail':              'bot@telecombolivianet.bo',
      'sistema.botPassword':           'BotP4ss!',
      'sistema.jwtRefreshMarginMinutes': 5,
    };
    return cfg[key] ?? null;
  }),
};

const CLIENT_DTO = {
  Id:            'uuid-001',
  TbnCode:       'TBN-001',
  FullName:      'Juan Mamani',
  PhoneMain:     '70000001',
  Status:        'Activo',
  PlanId:        'plan-uuid',
  PlanName:      'Plan Plata',
  PlanSpeedMbps: 10,
  TotalDebt:     150,
  PendingMonths: 1,
  Zone:          'Norte',
};

const INVOICES = [
  { Id: 'inv-001', Month: 4, Year: 2026, Amount: 150, DueDate: '2026-04-05', Status: 'Pendiente', PaidAt: null },
  { Id: 'inv-002', Month: 3, Year: 2026, Amount: 150, DueDate: '2026-03-05', Status: 'Pagada',    PaidAt: '2026-03-03' },
];

const retryPolicyMock = { execute: jest.fn((fn: () => Promise<unknown>) => fn()) };

describe('SistemaApiService', () => {
  let service: SistemaApiService;

  beforeEach(async () => {
    jest.clearAllMocks();
    retryPolicyMock.execute.mockImplementation((fn: () => Promise<unknown>) => fn());

    const axiosDefault = require('axios');
    axiosDefault.post.mockResolvedValue({
      data: { token: 'bot.jwt.token' },
    });
    axiosDefault.default.post = axiosDefault.post;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SistemaApiService,
        { provide: ConfigService, useValue: configMock },
        { provide: RETRY_POLICY, useValue: retryPolicyMock },
      ],
    }).compile();

    service = module.get<SistemaApiService>(SistemaApiService);
    await service.onModuleInit();
  });


  describe('getClientByPhone()', () => {
    it('TC-SIS-01 — normaliza número 591XXXXXXXX quitando el prefijo 591', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: CLIENT_DTO } });

      await service.getClientByPhone('59170000001');

      expect(mockGet).toHaveBeenCalledWith(
        '/api/clients/by-phone',
        { params: { phone: '70000001' } },
      );
    });

    it('TC-SIS-02 — retorna null cuando el cliente no existe (404)', async () => {
      mockGet.mockRejectedValueOnce({ response: { status: 404 } });

      const result = await service.getClientByPhone('59199999999');

      expect(result).toBeNull();
    });

    it('TC-SIS-03 — propaga el error si no es 404', async () => {
      mockGet.mockRejectedValueOnce({ response: { status: 500 }, message: 'Server error' });

      await expect(service.getClientByPhone('59170000001')).rejects.toBeTruthy();
    });

    it('TC-SIS-04 — retorna el DTO del cliente cuando existe', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: CLIENT_DTO } });

      const client = await service.getClientByPhone('70000001');

      expect(client).not.toBeNull();
      expect(client!.TbnCode).toBe('TBN-001');
      expect(client!.TotalDebt).toBe(150);
    });

    it('TC-SIS-05 — número sin prefijo 591 se envía tal cual', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: CLIENT_DTO } });

      await service.getClientByPhone('70000001');

      expect(mockGet).toHaveBeenCalledWith(
        '/api/clients/by-phone',
        { params: { phone: '70000001' } },
      );
    });
  });


  describe('getClientInvoices()', () => {
    it('TC-SIS-06 — llama GET /api/clients/:id/invoices/bot con el año actual', async () => {
      const currentYear = new Date().getFullYear();
      mockGet.mockResolvedValueOnce({ data: { data: { Invoices: INVOICES } } });

      await service.getClientInvoices('uuid-001');

      expect(mockGet).toHaveBeenCalledWith(
        '/api/clients/uuid-001/invoices/bot',
        { params: { year: currentYear } },
      );
    });

    it('TC-SIS-07 — retorna el array de facturas correctamente', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: { Invoices: INVOICES } } });

      const invoices = await service.getClientInvoices('uuid-001');

      expect(invoices).toHaveLength(2);
      expect(invoices[0].Status).toBe('Pendiente');
      expect(invoices[1].Status).toBe('Pagada');
    });

    it('TC-SIS-08 — retorna array vacío si Invoices es undefined', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: {} } });

      const invoices = await service.getClientInvoices('uuid-001');

      expect(invoices).toEqual([]);
    });
  });


  describe('getPendingInvoices()', () => {
    it('TC-SIS-09 — retorna solo facturas Pendiente y Vencida', async () => {
      const invoicesConVencida = [
        ...INVOICES,
        { Id: 'inv-003', Month: 2, Year: 2026, Amount: 150, DueDate: '2026-02-05', Status: 'Vencida', PaidAt: null },
      ];
      mockGet.mockResolvedValueOnce({ data: { data: { Invoices: invoicesConVencida } } });

      const pending = await service.getPendingInvoices('uuid-001');

      expect(pending).toHaveLength(2);
      pending.forEach((inv) => {
        expect(['Pendiente', 'Vencida']).toContain(inv.Status);
      });
    });

    it('TC-SIS-10 — retorna lista vacía si no hay facturas pendientes', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: { Invoices: [INVOICES[1]] } } });

      const pending = await service.getPendingInvoices('uuid-001');

      expect(pending).toHaveLength(0);
    });
  });


  describe('getActivePlans()', () => {
    it('TC-SIS-11 — mapea SpeedMb del backend a SpeedMbps internamente', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          data: [
            { Id: 'plan-1', Name: 'Plan Básico', SpeedMb: 5, MonthlyPrice: 80, IsActive: true },
            { Id: 'plan-2', Name: 'Plan Plata',  SpeedMb: 10, MonthlyPrice: 150, IsActive: true },
          ],
        },
      });

      const plans = await service.getActivePlans();

      expect(plans).toHaveLength(2);
      expect(plans[0].SpeedMbps).toBe(5);
      expect(plans[1].SpeedMbps).toBe(10);
      expect(plans[0].PriceMonthly).toBe(80);
    });

    it('TC-SIS-12 — retorna array vacío si no hay planes', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: [] } });

      const plans = await service.getActivePlans();

      expect(plans).toEqual([]);
    });
  });


  describe('token / login', () => {
    it('TC-SIS-13 — getCurrentToken devuelve el token tras el login inicial', () => {
      expect(service.getCurrentToken()).toBe('bot.jwt.token');
    });
  });


  describe('getCompanyQrBuffer()', () => {
    it('TC-SIS-14 — pide el QR como arraybuffer y devuelve un Buffer', async () => {
      mockGet.mockResolvedValueOnce({ data: Buffer.from('PNGDATA') });

      const buf = await service.getCompanyQrBuffer();

      expect(mockGet).toHaveBeenCalledWith('/api/bot-config/company-qr', { responseType: 'arraybuffer' });
      expect(Buffer.isBuffer(buf)).toBe(true);
      expect(buf.toString()).toBe('PNGDATA');
    });
  });


  describe('instalaciones', () => {
    it('TC-SIS-15 — getInstallationSlots pasa dias y planId', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: [{ Fecha: '2026-07-30', HoraInicio: '09:00', Disponibles: 2 }] } });

      const slots = await service.getInstallationSlots(5, 'plan-1');

      expect(mockGet).toHaveBeenCalledWith('/api/instalaciones/slots-disponibles', { params: { dias: 5, planId: 'plan-1' } });
      expect(slots).toHaveLength(1);
    });

    it('TC-SIS-16 — getInstallationSlots sin planId no incluye el param', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: [] } });

      await service.getInstallationSlots(7);

      expect(mockGet).toHaveBeenCalledWith('/api/instalaciones/slots-disponibles', { params: { dias: 7 } });
    });

    it('TC-SIS-17 — createInstallation postea el payload y devuelve ids', async () => {
      mockPost.mockResolvedValueOnce({ data: { data: { InstalacionId: 'ins-1', TicketId: 'tk-1' } } });

      const res = await service.createInstallation({
        ClienteId: null, PlanId: 'p1', Fecha: '2026-07-30', HoraInicio: '09:00',
        Direccion: 'Av. Siempre Viva', ProspectName: 'Ana', ProspectPhone: '70000009',
      });

      expect(mockPost).toHaveBeenCalledWith('/api/instalaciones', expect.objectContaining({ ProspectName: 'Ana' }));
      expect(res).toEqual({ InstalacionId: 'ins-1', TicketId: 'tk-1' });
    });

    it('TC-SIS-18 — cancelInstallation manda motivo y CanceladoPor=CLIENTE', async () => {
      mockPatch.mockResolvedValueOnce({ data: {} });

      await service.cancelInstallation('ins-1', 'ya no quiero');

      expect(mockPatch).toHaveBeenCalledWith('/api/instalaciones/ins-1/cancelar', {
        MotivoCancelacion: 'ya no quiero', CanceladoPor: 'CLIENTE',
      });
    });

    it('TC-SIS-19 — rescheduleInstallation incluye Motivo solo si se pasa', async () => {
      mockPatch.mockResolvedValue({ data: {} });

      await service.rescheduleInstallation('ins-1', '2026-08-01', '10:00', 'lluvia');
      expect(mockPatch).toHaveBeenLastCalledWith('/api/instalaciones/ins-1/reprogramar', {
        Fecha: '2026-08-01', HoraInicio: '10:00', Motivo: 'lluvia',
      });

      await service.rescheduleInstallation('ins-2', '2026-08-02', '11:00');
      expect(mockPatch).toHaveBeenLastCalledWith('/api/instalaciones/ins-2/reprogramar', {
        Fecha: '2026-08-02', HoraInicio: '11:00',
      });
    });
  });


  describe('tickets', () => {
    it('TC-SIS-20 — createTicket postea el dto y devuelve Id', async () => {
      mockPost.mockResolvedValueOnce({ data: { data: { Id: 'tk-9', TicketNumber: 'T-9' } } });

      const res = await service.createTicket({
        ClientId: 'c1', Subject: 'x', Type: 'SoporteTecnico', Priority: 'Alta', Description: 'sin internet',
      });

      expect(mockPost).toHaveBeenCalledWith('/api/tickets', expect.objectContaining({ ClientId: 'c1' }));
      expect(res.Id).toBe('tk-9');
    });

    it('TC-SIS-21 — buildTicketSubject usa la etiqueta legible del tipo', () => {
      const subject = service.buildTicketSubject({
        type: 'SoporteTecnico', tbnCode: 'TBN-001', clientName: 'Juan', priority: 'Alta',
      });
      expect(subject).toBe('[Soporte Técnico] TBN-001 – Juan – Alta');
    });

    it('TC-SIS-22 — buildTicketSubject usa el tipo crudo si es desconocido y trunca a 200', () => {
      const subject = service.buildTicketSubject({
        type: 'TipoRaro', tbnCode: 'TBN-001', clientName: 'X'.repeat(300), priority: 'Baja',
      });
      expect(subject.startsWith('[TipoRaro]')).toBe(true);
      expect(subject.length).toBe(200);
    });

    it('TC-SIS-23 — closeTicket manda Status=Resuelto con nota opcional', async () => {
      mockPatch.mockResolvedValue({ data: {} });

      await service.closeTicket('tk-1', 'resuelto ok');
      expect(mockPatch).toHaveBeenLastCalledWith('/api/tickets/tk-1/status', {
        Status: 'Resuelto', ResolutionMessage: 'resuelto ok',
      });

      await service.closeTicket('tk-2');
      expect(mockPatch).toHaveBeenLastCalledWith('/api/tickets/tk-2/status', { Status: 'Resuelto' });
    });

    it('PASO 2B — closeTicket devuelve el ticketNumber que trae la respuesta del backend', async () => {
      mockPatch.mockResolvedValue({ data: { data: { TicketNumber: 'TK-2026-0047' } } });

      const result = await service.closeTicket('tk-1', 'resuelto ok');

      expect(result.ticketNumber).toBe('TK-2026-0047');
    });

    it('PASO 2B — closeTicket devuelve ticketNumber=null si la respuesta no lo trae (no explota)', async () => {
      mockPatch.mockResolvedValue({ data: {} });

      const result = await service.closeTicket('tk-1');

      expect(result.ticketNumber).toBeNull();
    });

    it('TC-SIS-24 — updateTicket hace PUT con Description/RootCause presentes', async () => {
      mockPut.mockResolvedValueOnce({ data: {} });

      await service.updateTicket('tk-1', 'nueva desc', 'cable roto');

      expect(mockPut).toHaveBeenCalledWith('/api/tickets/tk-1', {
        Description: 'nueva desc', RootCause: 'cable roto', Priority: null,
      });
    });

    it('PASO 2B — updateTicket devuelve el ticketNumber que trae la respuesta del backend', async () => {
      mockPut.mockResolvedValueOnce({ data: { data: { TicketNumber: 'TK-2026-0050' } } });

      const result = await service.updateTicket('tk-1', 'nueva desc');

      expect(result.ticketNumber).toBe('TK-2026-0050');
    });

    it('TC-SIS-25 — rescheduleTicket hace PATCH /reschedule con Fecha y Hora', async () => {
      mockPatch.mockResolvedValueOnce({ data: {} });

      await service.rescheduleTicket('tk-1', '2026-08-01', '15:00');

      expect(mockPatch).toHaveBeenCalledWith('/api/tickets/tk-1/reschedule', {
        Fecha: '2026-08-01', Hora: '15:00',
      });
    });

    it('PASO 2B — rescheduleTicket devuelve el ticketNumber que trae la respuesta del backend', async () => {
      mockPatch.mockResolvedValueOnce({ data: { data: { TicketNumber: 'TK-2026-0060' } } });

      const result = await service.rescheduleTicket('tk-1', '2026-08-01', '15:00');

      expect(result.ticketNumber).toBe('TK-2026-0060');
    });

    it('TC-SIS-26 — reopenTicket pone EnProceso con nota prefijada', async () => {
      mockPatch.mockResolvedValueOnce({ data: {} });

      await service.reopenTicket('tk-1', 'volvió a fallar');

      const [url, body] = mockPatch.mock.calls[0];
      expect(url).toBe('/api/tickets/tk-1/status');
      expect(body.Status).toBe('EnProceso');
      expect(body.ResolutionMessage).toContain('volvió a fallar');
    });

    it('PASO 2B — reopenTicket devuelve el ticketNumber que trae la respuesta del backend', async () => {
      mockPatch.mockResolvedValueOnce({ data: { data: { TicketNumber: 'TK-2026-0070' } } });

      const result = await service.reopenTicket('tk-1', 'volvió a fallar');

      expect(result.ticketNumber).toBe('TK-2026-0070');
    });

    it('TC-SIS-27 — getClientActiveTickets filtra Cerrado y limita a 5', async () => {
      const many = Array.from({ length: 7 }, (_, i) => ({
        Id: `t${i}`, Subject: 's', Status: i === 0 ? 'Cerrado' : 'Abierto', Priority: 'Media', Type: 'SoporteTecnico', CreatedAt: 'now',
      }));
      mockGet.mockResolvedValueOnce({ data: { data: many } });

      const tickets = await service.getClientActiveTickets('c1');

      expect(mockGet).toHaveBeenCalledWith('/api/tickets/by-client/c1');
      expect(tickets).toHaveLength(5);              // 6 no-cerrados, recortados a 5
      expect(tickets.every(t => t.Status !== 'Cerrado')).toBe(true);
    });

    it('TC-SIS-28 — getClientActiveTickets devuelve [] ante 404', async () => {
      mockGet.mockRejectedValueOnce({ response: { status: 404 } });
      expect(await service.getClientActiveTickets('c1')).toEqual([]);
    });

    it('TC-SIS-29 — getClientActiveTickets propaga errores no-404', async () => {
      mockGet.mockRejectedValueOnce({ response: { status: 500 }, message: 'boom' });
      await expect(service.getClientActiveTickets('c1')).rejects.toBeTruthy();
    });
  });


  describe('requestPlanChange / postDeliveryStatus / getBotConfigPublic', () => {
    it('TC-SIS-30 — requestPlanChange devuelve el changeId', async () => {
      mockPost.mockResolvedValueOnce({ data: { data: { ChangeId: 'chg-1' } } });

      const res = await service.requestPlanChange('c1', 'plan-2', 'quiero más velocidad');

      expect(mockPost).toHaveBeenCalledWith('/api/clients/c1/plan-change', {
        NewPlanId: 'plan-2', Notes: 'quiero más velocidad',
      });
      expect(res.changeId).toBe('chg-1');
    });

    it('TC-SIS-31 — postDeliveryStatus parsea el timestamp a entero', async () => {
      mockPost.mockResolvedValueOnce({ data: {} });

      await service.postDeliveryStatus('wamid.1', 'delivered', '1700000000');

      expect(mockPost).toHaveBeenCalledWith('/api/notifications/delivery-status', {
        WaMessageId: 'wamid.1', Status: 'delivered', Timestamp: 1700000000,
      });
    });

    it('TC-SIS-32 — postDeliveryStatus traga el error (no lanza)', async () => {
      mockPost.mockRejectedValueOnce(new Error('down'));
      await expect(service.postDeliveryStatus('wamid.1', 'read', '1700000000')).resolves.toBeUndefined();
    });

    it('TC-SIS-33 — getBotConfigPublic devuelve data.data o null', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: { Menu: {} } } });
      expect(await service.getBotConfigPublic()).toEqual({ Menu: {} });

      mockGet.mockResolvedValueOnce({ data: {} });
      expect(await service.getBotConfigPublic()).toBeNull();
    });
  });


  describe('checkCoverage()', () => {
    it('TC-SIS-34 — outcome CONFIRMED → covered:true con zoneName', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: { outcome: 'confirmed', zoneName: 'Norte' } } });
      expect(await service.checkCoverage(-17.7, -63.1)).toEqual({ covered: true, zoneName: 'Norte' });
    });

    it('TC-SIS-35 — outcome NO_COVERAGE (ambas grafías) → covered:false', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: { Outcome: 'NoCoverage', ZoneName: null } } });
      expect(await service.checkCoverage(-17, -63)).toEqual({ covered: false, zoneName: null });

      mockGet.mockResolvedValueOnce({ data: { data: { outcome: 'NO_COVERAGE' } } });
      expect(await service.checkCoverage(-17, -63)).toEqual({ covered: false, zoneName: null });
    });

    it('TC-SIS-36 — outcome desconocido → covered:null con escalationReason', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: { outcome: 'ESCALATE', escalationReason: 'borde de zona' } } });
      expect(await service.checkCoverage(-17, -63)).toEqual({ covered: null, zoneName: null, escalationReason: 'borde de zona' });
    });

    it('TC-SIS-37 — sin outcome usa hasCoverage', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: { hasCoverage: true } } });
      expect(await service.checkCoverage(-17, -63)).toEqual({ covered: true });

      mockGet.mockResolvedValueOnce({ data: { data: { hasCoverage: false } } });
      expect(await service.checkCoverage(-17, -63)).toEqual({ covered: false });
    });

    it('TC-SIS-38 — sin outcome ni hasCoverage → covered:null', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: {} } });
      expect(await service.checkCoverage(-17, -63)).toEqual({ covered: null });
    });

    it('TC-SIS-39 — 404 → covered:null (sin lanzar)', async () => {
      mockGet.mockRejectedValueOnce({ response: { status: 404 } });
      expect(await service.checkCoverage(-17, -63)).toEqual({ covered: null });
    });

    it('TC-SIS-40 — error no-404 se propaga', async () => {
      mockGet.mockRejectedValueOnce({ response: { status: 500 }, message: 'boom' });
      await expect(service.checkCoverage(-17, -63)).rejects.toBeTruthy();
    });
  });


  describe('interceptores JWT + ensureToken', () => {
    const requestInterceptor = () => mockHttpInstance.interceptors.request.use.mock.calls[0][0];
    const responseRejected  = () => mockHttpInstance.interceptors.response.use.mock.calls[0][1];

    it('TC-SIS-41 — el interceptor de request añade el header Authorization', async () => {
      const cfg = await requestInterceptor()({ headers: {} as Record<string, string> });
      expect(cfg.headers['Authorization']).toBe('Bearer bot.jwt.token');
    });

    it('TC-SIS-42 — ensureToken renueva el token cuando está por expirar', async () => {
      (service as any).tokenExpiresAt = new Date(Date.now() + 1000); // 1 s < margen 5 min
      const axiosDefault = require('axios');
      axiosDefault.post.mockResolvedValueOnce({ data: { data: { Token: 'nuevo.jwt' } } });

      await requestInterceptor()({ headers: {} as Record<string, string> });

      expect(service.getCurrentToken()).toBe('nuevo.jwt');
    });

    it('TC-SIS-43 — ensureToken hace login si no hay token', async () => {
      (service as any).token = null;
      (service as any).tokenExpiresAt = null;
      const axiosDefault = require('axios');
      axiosDefault.post.mockResolvedValueOnce({ data: { token: 'relogin.jwt' } });

      await requestInterceptor()({ headers: {} as Record<string, string> });

      expect(service.getCurrentToken()).toBe('relogin.jwt');
    });

    it('TC-SIS-44 — el interceptor de response reintenta una vez ante 401', async () => {
      const axiosDefault = require('axios');
      axiosDefault.post.mockResolvedValueOnce({ data: { token: 'refreshed.jwt' } });
      mockRequest.mockResolvedValueOnce({ data: { ok: true } });

      const err = { response: { status: 401 }, config: { headers: {} as Record<string, string> } };
      await responseRejected()(err);

      expect(mockRequest).toHaveBeenCalled();
      expect(err.config.headers['Authorization']).toBe('Bearer refreshed.jwt');
    });

    it('TC-SIS-45 — el interceptor de response no reintenta un 401 ya reintentado', async () => {
      const err = { response: { status: 401 }, config: { headers: {}, _retried: true } };
      await expect(responseRejected()(err)).rejects.toBe(err);
    });

    it('TC-SIS-46 — el interceptor de response propaga errores no-401', async () => {
      const err = { response: { status: 500 }, config: { headers: {} } };
      await expect(responseRejected()(err)).rejects.toBe(err);
    });
  });

  // ── P1.1 (auditoría 2026-08): reintento de errores transitorios (timeout/5xx) ──
  describe('interceptor de reintento transitorio (P1.1)', () => {
    const transientRejected = () => mockHttpInstance.interceptors.response.use.mock.calls[1][1];

    it('TC-SIS-47 — se registra un segundo interceptor de response además del de 401', () => {
      expect(mockHttpInstance.interceptors.response.use).toHaveBeenCalledTimes(2);
    });

    it('TC-SIS-48 — reintenta un 503 usando IRetryPolicy con label "sistema-api"', async () => {
      mockRequest.mockResolvedValueOnce({ data: { ok: true } });
      const err = { response: { status: 503 }, config: {} };

      const result = await transientRejected()(err);

      expect(retryPolicyMock.execute).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ label: 'sistema-api' }),
      );
      expect((result as any).data).toEqual({ ok: true });
    });

    it('TC-SIS-49 — no reintenta dos veces el mismo request (marca _retriedTransient)', async () => {
      const err: any = { response: { status: 503 }, config: {} };
      mockRequest.mockResolvedValue({ data: { ok: true } });

      await transientRejected()(err);
      await expect(transientRejected()(err)).rejects.toBe(err);

      expect(retryPolicyMock.execute).toHaveBeenCalledTimes(1);
    });

    it('TC-SIS-50 — propaga el error si IRetryPolicy agota los intentos (no retryable o persistente)', async () => {
      const err = { response: { status: 400 }, config: {} };
      retryPolicyMock.execute.mockRejectedValueOnce(err);

      await expect(transientRejected()(err)).rejects.toBe(err);
    });

    it('TC-SIS-51 — sin err.config (error sin request asociado) no intenta reintentar', async () => {
      const err = { message: 'network down' };
      await expect(transientRejected()(err)).rejects.toBe(err);
      expect(retryPolicyMock.execute).not.toHaveBeenCalled();
    });
  });
});
