import type { IncomingMessage } from '../../modules/bot/bot-orchestrator.service';

export const buildIncomingMessage = (overrides?: Partial<IncomingMessage>): IncomingMessage => ({
  from:      '59171435981',
  messageId: 'msg-test-001',
  type:      'text',
  text:      'Hola, necesito ayuda',
  ...overrides,
});

export const buildAudioMessage = (overrides?: Partial<IncomingMessage>): IncomingMessage =>
  buildIncomingMessage({ type: 'audio', audioId: 'audio-001', text: undefined, ...overrides });

export const buildImageMessage = (overrides?: Partial<IncomingMessage>): IncomingMessage =>
  buildIncomingMessage({ type: 'image', imageId: 'image-001', text: undefined, ...overrides });

export const buildLocationMessage = (overrides?: Partial<IncomingMessage>): IncomingMessage =>
  buildIncomingMessage({
    type:            'location',
    locationLat:     -17.3895,
    locationLng:     -66.1568,
    locationName:    'Plaza Principal',
    locationAddress: 'Cochabamba, Bolivia',
    text:            undefined,
    ...overrides,
  });
