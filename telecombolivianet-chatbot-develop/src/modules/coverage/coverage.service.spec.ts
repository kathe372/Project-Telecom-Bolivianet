import { Test, TestingModule } from '@nestjs/testing';
import { CoverageMessageResolver } from './coverage-message.resolver';
import { CoverageService } from './coverage.service';
import { NominatimService } from './nominatim.service';
import { COVERAGE_REPOSITORY } from './coverage.interfaces';
import type { SessionData } from '../session/session.service';

// ─── Helper ───────────────────────────────────────────────────
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

describe('CoverageService', () => {
  let service: CoverageService;
  let mockRepo:     { checkCoverage: jest.Mock };
  let mockNominatim: { geocode: jest.Mock };

  beforeEach(async () => {
    mockRepo      = { checkCoverage: jest.fn() };
    mockNominatim = { geocode: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoverageService,
        CoverageMessageResolver,
        { provide: COVERAGE_REPOSITORY, useValue: mockRepo },
        { provide: NominatimService,     useValue: mockNominatim },
      ],
    }).compile();

    service = module.get<CoverageService>(CoverageService);
  });

  it('TC-CS01 — retorna CONFIRMED cuando repo devuelve true', async () => {
    mockRepo.checkCoverage.mockResolvedValue({ covered: true });
    const result = await service.check({ type: 'gps', lat: -17.389, lng: -66.156 }, makeSession());
    expect(result.outcome).toBe('CONFIRMED');
    expect(result.lat).toBe(-17.389);
    expect(result.lng).toBe(-66.156);
  });

  it('TC-CS02 — retorna NO_COVERAGE cuando repo devuelve false', async () => {
    mockRepo.checkCoverage.mockResolvedValue({ covered: false });
    const result = await service.check({ type: 'gps', lat: -17.389, lng: -66.156 }, makeSession());
    expect(result.outcome).toBe('NO_COVERAGE');
  });

  it('TC-CS03 — retorna ESCALATE cuando repo devuelve null (zona no registrada)', async () => {
    mockRepo.checkCoverage.mockResolvedValue({ covered: null });
    const result = await service.check({ type: 'gps', lat: -17.389, lng: -66.156 }, makeSession());
    expect(result.outcome).toBe('ESCALATE');
  });

  it('TC-CS04 — retorna NO_COORDS cuando texto vacío y sin ubicación en sesión', async () => {
    mockNominatim.geocode.mockResolvedValue(null);
    const result = await service.check({ type: 'text', text: '' }, makeSession());
    expect(result.outcome).toBe('NO_COORDS');
    expect(mockRepo.checkCoverage).not.toHaveBeenCalled();
  });

  it('TC-CS05 — usa ubicación reciente de sesión ignorando el input', async () => {
    mockRepo.checkCoverage.mockResolvedValue({ covered: true });
    const session = makeSession({
      lastLocation:       { lat: -17.389, lng: -66.156 },
      locationCapturedAt: Date.now() - 60_000, // 1 min ago
    });
    // Even if input says something else, session location takes priority
    await service.check({ type: 'text', text: 'zona norte' }, session);
    expect(mockRepo.checkCoverage).toHaveBeenCalledWith(-17.389, -66.156);
  });

  it('BUG-04 — usa ubicación de 20 min (dentro de la ventana de 30 min)', async () => {
    mockRepo.checkCoverage.mockResolvedValue({ covered: true });
    const session = makeSession({
      lastLocation:       { lat: -17.389, lng: -66.156 },
      locationCapturedAt: Date.now() - 20 * 60_000, // 20 min ago → aún fresca
    });
    await service.check({ type: 'text', text: 'zona norte' }, session);
    expect(mockRepo.checkCoverage).toHaveBeenCalledWith(-17.389, -66.156);
  });

  it('TC-CS06 — ignora ubicación de sesión expirada (> 30 min)', async () => {
    mockNominatim.geocode.mockResolvedValue(null);
    const session = makeSession({
      lastLocation:       { lat: -17.389, lng: -66.156 },
      locationCapturedAt: Date.now() - 40 * 60_000, // 40 min ago → caducada
    });
    const result = await service.check({ type: 'text', text: 'zona norte' }, session);
    expect(result.outcome).toBe('NO_COORDS');
  });

  it('TC-CS07 — extrae coords de URL de Google Maps y consulta cobertura', async () => {
    mockRepo.checkCoverage.mockResolvedValue({ covered: true });
    const result = await service.check(
      { type: 'google_maps_url', url: 'https://www.google.com/maps?q=-17.389,-66.156' },
      makeSession(),
    );
    expect(mockRepo.checkCoverage).toHaveBeenCalledWith(-17.389, -66.156);
    expect(result.outcome).toBe('CONFIRMED');
  });

  it('TC-CS08 — usa Nominatim cuando el texto no contiene coords', async () => {
    mockNominatim.geocode.mockResolvedValue({ lat: -17.389, lng: -66.156 });
    mockRepo.checkCoverage.mockResolvedValue({ covered: false });
    const result = await service.check({ type: 'text', text: 'Zona Norte' }, makeSession());
    expect(mockNominatim.geocode).toHaveBeenCalledWith('Zona Norte');
    expect(result.outcome).toBe('NO_COVERAGE');
  });

  it('TC-CS09 — retorna ESCALATE cuando checkCoverage lanza un error', async () => {
    mockRepo.checkCoverage.mockRejectedValue(new Error('Network error'));
    const result = await service.check({ type: 'gps', lat: -17.389, lng: -66.156 }, makeSession());
    expect(result.outcome).toBe('ESCALATE');
  });
});
