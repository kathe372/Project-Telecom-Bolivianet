import { SessionData } from '../../session/session.service';

export interface MessageContext {
  phone: string;
  messageId: string;
  type: string;
  text?: string;
  interactiveId?: string;
  imageId?: string;
  imageCaption?: string;
  audioId?: string;
  locationLat?: number;
  locationLng?: number;
  locationName?: string;
  locationAddress?: string;

  audioBuffer?: Buffer | null;
  audioMediaUrl?: string;
  imageMediaUrl?: string;
  locationText?: string | null;
  userContent?: string;
  incomingMediaUrl?: string;
  incomingMediaType?: 'image' | 'audio';

  session?: SessionData;

  isFirstContact?: boolean;

  updatedSession?: SessionData;

  effectiveText?: string | null;

  humanAvailable: boolean;
}
