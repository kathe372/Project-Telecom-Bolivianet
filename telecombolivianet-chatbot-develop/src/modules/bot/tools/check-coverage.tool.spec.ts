import { InteractiveIdCodec } from '../intents/interactive-id.codec';
import { PLAN_REPOSITORY, INSTALLATION_REPOSITORY } from '../../client/sistema-api.interfaces';
import { Test, TestingModule } from '@nestjs/testing';
import { CheckCoverageTool } from './check-coverage.tool';
import { CoverageService } from '../../coverage/coverage.service';
import type { SessionData } from '../../session/session.service';
import type { CoverageCheckResult } from '../../coverage/coverage.interfaces';

const makeSession = (overrides: Partial<SessionData> = {}): SessionData => ({
  phoneNumber: '59171000000',
  clientId: null, clientName: null, clientStatus: null,
  planId: null,   planName: null,   totalDebt: 0, tbnCode: null,
  activeTicketId: null, activeInstallationId: null,
  pendingAction: null,  pendingTechIssue: null,  pendingCsatTicketId: null,
  isEscalated: false, 
  lastSentiment: 'neutral', angryCount: 0,
  lastLocation: null, locationCapturedAt: null, locationSource: null,
  pendingImageId: null, pendingImageCaption: null,
  messages: [],
  ...overrides,
});

const makeResult = (overrides: Partial<CoverageCheckResult> = {}): CoverageCheckResult => ({
  outcome: 'CONFIRMED',
  message: 'OK',
  ...overrides,
});

const mockPlanRepo = { getActivePlans: jest.fn() };
const mockInstRepo = { findScheduledInstallationByPhone: jest.fn() };

describe('CheckCoverageTool', () => {
  let tool: CheckCoverageTool;
  let mockCoverage: { check: jest.Mock };

  beforeEach(() => {
    mockPlanRepo.getActivePlans.mockResolvedValue([]);
    mockInstRepo.findScheduledInstallationByPhone.mockResolvedValue(null);
  });

  beforeEach(async () => {
    mockCoverage = { check: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckCoverageTool,
        { provide: CoverageService, useValue: mockCoverage },
        InteractiveIdCodec,
        { provide: PLAN_REPOSITORY,         useValue: mockPlanRepo },
        { provide: INSTALLATION_REPOSITORY, useValue: mockInstRepo },
      ],
    }).compile();

    tool = module.get<CheckCoverageTool>(CheckCoverageTool);
  });

  it('TC-TOOL01 — retorna covered:"true" cuando outcome=CONFIRMED', async () => {
    mockCoverage.check.mockResolvedValue(
      makeResult({ outcome: 'CONFIRMED', lat: -17.389, lng: -66.156 }),
    );
    const result = await tool.execute({ address: 'Zona Norte' }, makeSession()) as any;
    expect(result.covered).toBe('true');
    expect(result.lat).toBe(-17.389);
    expect(result.lng).toBe(-66.156);
  });

  it('TC-TOOL02 — retorna covered:"false" cuando outcome=NO_COVERAGE', async () => {
    mockCoverage.check.mockResolvedValue(makeResult({ outcome: 'NO_COVERAGE' }));
    const result = await tool.execute({ address: 'Zona Lejana' }, makeSession()) as any;
    expect(result.covered).toBe('false');
  });

  it('TC-TOOL03 — retorna covered:"unverified" cuando outcome=ESCALATE', async () => {
    mockCoverage.check.mockResolvedValue(makeResult({ outcome: 'ESCALATE' }));
    const result = await tool.execute({ address: 'Zona Desconocida' }, makeSession()) as any;
    expect(result.covered).toBe('unverified');
  });

  it('TC-TOOL04 — retorna covered:"no_location" cuando outcome=NO_COORDS', async () => {
    mockCoverage.check.mockResolvedValue(makeResult({ outcome: 'NO_COORDS' }));
    const result = await tool.execute({}, makeSession()) as any;
    expect(result.covered).toBe('no_location');
  });

  it('TC-TOOL05 — pasa URL de Google Maps como input tipo google_maps_url', async () => {
    mockCoverage.check.mockResolvedValue(makeResult({ outcome: 'CONFIRMED' }));
    await tool.execute(
      { address: 'https://www.google.com/maps?q=-17.389,-66.156' },
      makeSession(),
    );
    expect(mockCoverage.check).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'google_maps_url' }),
      expect.anything(),
    );
  });

  it('TC-TOOL06 — pasa texto plano como input tipo text', async () => {
    mockCoverage.check.mockResolvedValue(makeResult({ outcome: 'NO_COVERAGE' }));
    await tool.execute({ address: 'Calle Lanza 123' }, makeSession());
    expect(mockCoverage.check).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'text', text: 'Calle Lanza 123' }),
      expect.anything(),
    );
  });

  it('TC-TOOL07 — pasa texto vacío como input tipo text cuando no hay address', async () => {
    mockCoverage.check.mockResolvedValue(makeResult({ outcome: 'NO_COORDS' }));
    await tool.execute({}, makeSession());
    expect(mockCoverage.check).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'text', text: '' }),
      expect.anything(),
    );
  });

  it('TC-TOOL08 — maneja error del servicio devolviendo covered:"unverified"', async () => {
    mockCoverage.check.mockRejectedValue(new Error('Connection failed'));
    const result = await tool.execute({ address: 'Zona Norte' }, makeSession()) as any;
    expect(result.covered).toBe('unverified');
    expect(result.message).toContain('agente');
  });

  it('TC-TOOL09 — getName() retorna "check_coverage"', () => {
    expect(tool.getName()).toBe('check_coverage');
  });

  it('TC-TOOL10 — requiresIdentification() retorna false', () => {
    expect(tool.requiresIdentification()).toBe(false);
  });

  // Medido en produccion (2026-08-07): con cobertura confirmada, el modelo NUNCA
  // llamo a get_installation_plans. Escribio los planes de memoria —sin botones—
  // y despues fabrico `plan_id: "plan_platino"`. El cliente eligio PLATINO, el
  // resumen decia COBRE y el id enviado era un tercero.
  //
  // Los planes se adjuntan al resultado de la cobertura: el paso siguiente es
  // SIEMPRE elegir plan, asi que el dato va donde se necesita.
  describe('con cobertura, adjunta los planes', () => {
    beforeEach(() => {
      mockPlanRepo.getActivePlans.mockResolvedValue([
        { Id: 'uuid-cobre', Name: 'COBRE 20MB', DownloadSpeedMbps: 20, PriceMonthly: 89 },
        { Id: 'uuid-oro',   Name: 'ORO 80MB',   DownloadSpeedMbps: 80, PriceMonthly: 199 },
      ]);
    });

    it('devuelve la lista con botones y los ids reales', async () => {
      mockCoverage.check.mockResolvedValue({ outcome: 'CONFIRMED', message: 'Hay cobertura' });

      const r: any = await tool.execute({ address: '-17.35,-66.16' }, makeSession());

      expect(r.covered).toBe('true');
      expect(r._list.sections[0].rows).toHaveLength(2);
      expect(r.planes[0].id).toBe('uuid-cobre');
      expect(r.nota_para_el_agente).toMatch(/NO los repitas en texto/);
    });

    it('sin cobertura NO adjunta planes', async () => {
      mockCoverage.check.mockResolvedValue({ outcome: 'NO_COVERAGE', message: 'Sin cobertura' });

      const r: any = await tool.execute({ address: 'x' }, makeSession());

      expect(r._list).toBeUndefined();
      expect(r.planes).toBeUndefined();
    });

    // El duplicado se detectaba recien al confirmar, seis pasos despues.
    it('si ya tiene una instalacion pendiente, lo avisa acá y no ofrece planes', async () => {
      mockCoverage.check.mockResolvedValue({ outcome: 'CONFIRMED', message: 'Hay cobertura' });
      mockInstRepo.findScheduledInstallationByPhone.mockResolvedValue('ins-previa');

      const r: any = await tool.execute({ address: 'x' }, makeSession());

      expect(r.instalacion_pendiente).toBe(true);
      expect(r.nota_para_el_agente).toMatch(/YA tiene una instalación agendada/);
      expect(r._list).toBeUndefined();
    });

    // Un fallo al traer los planes no puede tumbar la respuesta de cobertura.
    it('si el catalogo falla, la cobertura se responde igual', async () => {
      mockCoverage.check.mockResolvedValue({ outcome: 'CONFIRMED', message: 'Hay cobertura' });
      mockPlanRepo.getActivePlans.mockRejectedValue(new Error('backend caido'));

      const r: any = await tool.execute({ address: 'x' }, makeSession());

      expect(r.covered).toBe('true');
      expect(r.message).toBe('Hay cobertura');
    });
  });

});
