import * as fs from 'fs';
import axios from 'axios';
import { MediaStorageService } from './media-storage.service';

jest.mock('fs');
jest.mock('axios');
const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedAxios = axios as jest.Mocked<typeof axios>;

function makeCfg(over: Record<string, unknown> = {}) {
  const base: Record<string, unknown> = {
    'storage.type': 'local',
    'storage.localPath': './uploads',
    'storage.publicUrl': 'https://cdn.example.com',
    'storage.supabase.url': 'https://sb.example.com',
    'storage.supabase.key': 'anon-key',
    'storage.supabase.bucket': 'chatbot-uploads',
    ...over,
  };
  return { get: jest.fn((k: string) => base[k]) } as any;
}

describe('MediaStorageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockedFs.mkdirSync as jest.Mock).mockReturnValue(undefined);
    (mockedFs.promises as any) = { writeFile: jest.fn().mockResolvedValue(undefined) };
  });

  describe('local', () => {
    it('crea el dir de uploads al iniciar', () => {
      new MediaStorageService(makeCfg());
      expect(mockedFs.mkdirSync).toHaveBeenCalledWith('./uploads', { recursive: true });
    });

    it('guarda imagen localmente y devuelve URL pública', async () => {
      const svc = new MediaStorageService(makeCfg());
      const url = await svc.saveMedia(Buffer.from('x'), 'image', 'qr1');
      expect((fs.promises.writeFile as jest.Mock)).toHaveBeenCalled();
      expect(url).toMatch(/^https:\/\/cdn\.example\.com\/uploads\/img_qr1_\d+\.jpg$/);
    });

    it('sin publicUrl → devuelve ruta relativa', async () => {
      const svc = new MediaStorageService(makeCfg({ 'storage.publicUrl': '' }));
      const url = await svc.saveMedia(Buffer.from('x'), 'audio', 'a1');
      expect(url).toMatch(/^\/uploads\/audio_a1_\d+\.ogg$/);
    });
  });

  describe('supabase', () => {
    it('sube a supabase y devuelve la URL pública del objeto', async () => {
      (mockedAxios.post as jest.Mock).mockResolvedValue({});
      const svc = new MediaStorageService(makeCfg({ 'storage.type': 'supabase' }));
      const url = await svc.saveMedia(Buffer.from('x'), 'image', 'qr9');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/storage/v1/object/chatbot-uploads/img_qr9_'),
        expect.any(Buffer),
        expect.objectContaining({ headers: expect.objectContaining({ apikey: 'anon-key' }) }),
      );
      expect(url).toContain('/storage/v1/object/public/chatbot-uploads/img_qr9_');
    });

    it('P4.2 — la subida a Supabase tiene timeout configurado (no cuelga indefinidamente)', async () => {
      (mockedAxios.post as jest.Mock).mockResolvedValue({});
      const svc = new MediaStorageService(makeCfg({ 'storage.type': 'supabase' }));
      await svc.saveMedia(Buffer.from('x'), 'image', 'qr9');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String), expect.any(Buffer),
        expect.objectContaining({ timeout: 30_000 }),
      );
    });
  });
});
