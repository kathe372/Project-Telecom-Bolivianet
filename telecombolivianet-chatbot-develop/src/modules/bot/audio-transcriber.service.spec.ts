import { AudioTranscriberService } from './audio-transcriber.service';

function make(enabled = true) {
  const config = { get: jest.fn((k: string) => ({ 'gemini.apiKey': 'key', 'gemini.chatModel': 'gemini-2.0-flash' }[k])) };
  const whatsappApi = {} as any;
  const geminiClient = {
    isEnabled: jest.fn().mockReturnValue(enabled),
    buildUrl: jest.fn().mockReturnValue('http://gemini/gen'),
    getAuthHeaders: jest.fn().mockResolvedValue({}),
  };
  const svc = new AudioTranscriberService(config as any, whatsappApi, geminiClient as any);
  const post = jest.fn();
  (svc as any).http = { post };
  return { svc, post, geminiClient };
}

const resWith = (text: string) => ({ data: { candidates: [{ content: { parts: [{ text }] } }] } });

describe('AudioTranscriberService.transcribeBuffer', () => {
  it('Gemini deshabilitado → null', async () => {
    const { svc, post } = make(false);
    expect(await svc.transcribeBuffer(Buffer.from('x'))).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it('transcribe correctamente → devuelve el texto', async () => {
    const { svc, post } = make();
    post.mockResolvedValue(resWith('  hola, no tengo internet  '));
    expect(await svc.transcribeBuffer(Buffer.from('x'))).toBe('hola, no tengo internet');
  });

  it('[inaudible] → null', async () => {
    const { svc, post } = make();
    post.mockResolvedValue(resWith('[inaudible]'));
    expect(await svc.transcribeBuffer(Buffer.from('x'))).toBeNull();
  });

  it('respuesta vacía → null', async () => {
    const { svc, post } = make();
    post.mockResolvedValue(resWith(''));
    expect(await svc.transcribeBuffer(Buffer.from('x'))).toBeNull();
  });

  it('envía el audio como inline_data en base64', async () => {
    const { svc, post } = make();
    post.mockResolvedValue(resWith('texto'));
    await svc.transcribeBuffer(Buffer.from('audio-bytes'), 'audio/ogg');
    const body = post.mock.calls[0][1];
    expect(body.contents[0].parts[0].inline_data.mime_type).toBe('audio/ogg');
    expect(body.contents[0].parts[0].inline_data.data).toBe(Buffer.from('audio-bytes').toString('base64'));
  });
});
