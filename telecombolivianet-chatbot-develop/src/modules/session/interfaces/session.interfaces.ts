
export interface ISessionCore {
  phoneNumber:  string;
  lastActivity: Date;
}

export interface IClientIdentity {
  clientId:     string | null;
  clientName:   string | null;
  clientStatus: string | null;
  tbnCode:      string | null;
  planId:       string | null;
  planName:     string | null;
  totalDebt:    number;
}

export interface IConversationState {
  isEscalated:          boolean;
  pendingAction:        string | null;
  pendingTechIssue:     string | null;
  pendingCsatTicketId:  string | null;
  activeTicketId:       string | null;
  activeInstallationId: string | null;
  pendingImageId:       string | null;
  pendingImageCaption:  string | null;
  lastSentiment:        'neutral' | 'frustrated' | 'angry' | 'happy';
  angryCount:           number;
}

export interface ILocationData {
  lastLocation:       { lat: number; lng: number; name?: string; address?: string } | null;
  locationCapturedAt: number | null | undefined;
  locationSource:     'whatsapp_gps' | 'google_maps' | 'nominatim' | null | undefined;
}
