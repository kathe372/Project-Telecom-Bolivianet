import type { SessionData } from '../../modules/session/session.service';

export const buildSession = (overrides?: Partial<SessionData>): SessionData => ({
  phoneNumber:          '59171435981',
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
  lastSentiment:        'neutral' as const,
  angryCount:           0,
  lastLocation:         null,
  locationCapturedAt:   null,
  locationSource:       null,
  pendingImageId:       null,
  pendingImageCaption:  null,
  previousSummary:      null,
  previousSummaryAt:    null,
  messages:             [],
  ...overrides,
});

export const buildClientSession = (overrides?: Partial<SessionData>): SessionData =>
  buildSession({
    clientId:     'client-uuid-001',
    clientName:   'Juan Pérez',
    clientStatus: 'Activo',
    planId:       'plan-uuid-001',
    planName:     'Fibra 50Mbps',
    tbnCode:      'TBN-001',
    ...overrides,
  });

export const buildEscalatedSession = (overrides?: Partial<SessionData>): SessionData =>
  buildClientSession({ isEscalated: true, ...overrides });
