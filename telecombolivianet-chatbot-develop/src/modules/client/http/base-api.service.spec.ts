import { BaseApiService } from './base-api.service';

// Subclase de prueba para exponer los métodos protected.
class TestApi extends BaseApiService {
  gGet<T>(p: string, params?: Record<string, unknown>) { return this.get<T>(p, params); }
  gPost<T>(p: string, b?: unknown) { return this.post<T>(p, b); }
  gPatch<T>(p: string, b?: unknown) { return this.patch<T>(p, b); }
}

function makeApi() {
  const http = { get: jest.fn(), post: jest.fn(), patch: jest.fn() };
  const auth = { http } as any;
  return { api: new TestApi(auth), http };
}

describe('BaseApiService', () => {
  it('get: llama http.get con params y desenvuelve res.data.data', async () => {
    const { api, http } = makeApi();
    http.get.mockResolvedValue({ data: { data: { ok: 1 } } });
    const r = await api.gGet('/x', { a: 1 });
    expect(http.get).toHaveBeenCalledWith('/x', { params: { a: 1 } });
    expect(r).toEqual({ ok: 1 });
  });

  it('post: llama http.post con el body y desenvuelve res.data.data', async () => {
    const { api, http } = makeApi();
    http.post.mockResolvedValue({ data: { data: { id: 'A' } } });
    const r = await api.gPost('/y', { name: 'z' });
    expect(http.post).toHaveBeenCalledWith('/y', { name: 'z' });
    expect(r).toEqual({ id: 'A' });
  });

  it('patch: llama http.patch con el body y desenvuelve res.data.data', async () => {
    const { api, http } = makeApi();
    http.patch.mockResolvedValue({ data: { data: null } });
    await api.gPatch('/z', { estado: 'cerrado' });
    expect(http.patch).toHaveBeenCalledWith('/z', { estado: 'cerrado' });
  });

  it('propaga el error del cliente HTTP', async () => {
    const { api, http } = makeApi();
    http.get.mockRejectedValue(new Error('network'));
    await expect(api.gGet('/x')).rejects.toThrow('network');
  });
});
