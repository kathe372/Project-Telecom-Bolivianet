import axios from 'axios';
import { GoogleMapsLinkResolverService } from './google-maps-link-resolver.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GoogleMapsLinkResolverService', () => {
  let service: GoogleMapsLinkResolverService;

  beforeEach(() => {
    service = new GoogleMapsLinkResolverService();
    jest.clearAllMocks();
  });

  it('TC-GMR01 — resuelve un link corto con un solo redirect (302 -> Location)', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      headers: { location: 'https://www.google.com/maps/place/.../data=!3d-17.43!4d-66.13' },
    } as any);

    const result = await service.resolveShortLink('https://maps.app.goo.gl/fezWs9uNQLWRh8oLA');

    expect(result).toBe('https://www.google.com/maps/place/.../data=!3d-17.43!4d-66.13');
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });

  it('TC-GMR02 — sigue varios saltos de redirect encadenados', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({ headers: { location: 'https://goo.gl/maps/intermedio' } } as any)
      .mockResolvedValueOnce({ headers: { location: 'https://www.google.com/maps/@-17.43,-66.13,17z' } } as any);

    const result = await service.resolveShortLink('https://maps.app.goo.gl/abc');

    expect(result).toBe('https://www.google.com/maps/@-17.43,-66.13,17z');
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
  });

  it('TC-GMR03 — si ya no es un link corto, la devuelve tal cual sin pedir nada', async () => {
    const result = await service.resolveShortLink('https://www.google.com/maps/@-17.43,-66.13,17z');

    expect(result).toBe('https://www.google.com/maps/@-17.43,-66.13,17z');
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('TC-GMR04 — devuelve null si la petición falla (timeout, DNS, etc.)', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('timeout of 5000ms exceeded'));

    const result = await service.resolveShortLink('https://maps.app.goo.gl/roto');

    expect(result).toBeNull();
  });

  it('TC-GMR05 — corta tras el máximo de saltos permitidos en vez de loopear infinito', async () => {
    mockedAxios.get.mockResolvedValue({ headers: { location: 'https://maps.app.goo.gl/loop' } } as any);

    const result = await service.resolveShortLink('https://maps.app.goo.gl/loop');

    expect(mockedAxios.get).toHaveBeenCalledTimes(5);
    expect(result).toBe('https://maps.app.goo.gl/loop');
  });
});
