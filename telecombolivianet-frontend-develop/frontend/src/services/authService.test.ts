import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('./api', () => ({
  default: {
    get:    vi.fn(),
    put:    vi.fn(),
    post:   vi.fn(),
    patch:  vi.fn(),
    delete: vi.fn(),
  },
}));

import api from './api';
import { authService } from './authService';


describe('authService.login', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC-AUTH-FE-01 — llama POST /auth/login con email y password', async () => {
    (api.post as Mock).mockResolvedValueOnce({
      data: {
        data: {
          Token:    'access.jwt.token',
          UserId:   'uuid-admin',
          FullName: 'Administrador',
          Role:     'Admin',
          RequiresPasswordChange: false,
          RedirectUrl: '/dashboard',
        },
      },
    });

    await authService.login({ Email: 'admin@telecom.bo', Password: 'Segura123!' });

    expect(api.post).toHaveBeenCalledWith('/auth/login', {
      Email:    'admin@telecom.bo',
      Password: 'Segura123!',
    });
  });

  it('TC-AUTH-FE-02 — retorna los datos de sesión correctamente', async () => {
    const payload = {
      Token:    'mi.jwt.token',
      UserId:   'uuid-001',
      FullName: 'Juan Mamani',
      Role:     'Tecnico',
      RequiresPasswordChange: false,
      RedirectUrl: '/tickets',
    };
    (api.post as Mock).mockResolvedValueOnce({ data: { data: payload } });

    const result = await authService.login({ Email: 'tech@bo', Password: 'pass' });

    expect(result.Token).toBe('mi.jwt.token');
    expect(result.Role).toBe('Tecnico');
    expect(result.RequiresPasswordChange).toBe(false);
  });

  it('TC-AUTH-FE-03 — propaga el error cuando el servidor responde 401', async () => {
    (api.post as Mock).mockRejectedValueOnce({
      response: { status: 401, data: { error: 'Credenciales incorrectas.' } },
    });

    await expect(
      authService.login({ Email: 'x@bo', Password: 'wrong' })
    ).rejects.toBeTruthy();
  });
});

describe('authService.logout', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC-AUTH-FE-04 — llama POST /auth/logout sin body (refresh token está en cookie)', async () => {
    (api.post as Mock).mockResolvedValueOnce({});

    await authService.logout();

    expect(api.post).toHaveBeenCalledWith('/auth/logout');
    const callArgs = (api.post as Mock).mock.calls[0];
    expect(callArgs.length).toBe(1);
  });

  it('TC-AUTH-FE-05 — logout no retorna valor (void)', async () => {
    (api.post as Mock).mockResolvedValueOnce({});

    const result = await authService.logout();

    expect(result).toBeUndefined();
  });
});

describe('authService.changePassword', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC-AUTH-FE-06 — llama PUT /auth/change-password con currentPassword y newPassword', async () => {
    (api.put as Mock).mockResolvedValueOnce({});

    await authService.changePassword({
      CurrentPassword: 'Actual123!',
      NewPassword:     'Nueva456!',
      ConfirmPassword: 'Nueva456!',
    });

    expect(api.put).toHaveBeenCalledWith('/auth/change-password', {
      CurrentPassword: 'Actual123!',
      NewPassword:     'Nueva456!',
      ConfirmPassword: 'Nueva456!',
    });
  });
});

describe('authService.me', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC-AUTH-FE-07 — llama GET /auth/me y retorna datos del usuario', async () => {
    const userData = { UserId: 'uuid-001', FullName: 'Admin', Role: 'Admin' };
    (api.get as Mock).mockResolvedValueOnce({ data: { data: userData } });

    const result = await authService.me();

    expect(api.get).toHaveBeenCalledWith('/auth/me');
    expect(result.UserId).toBe('uuid-001');
    expect(result.Role).toBe('Admin');
  });
});
