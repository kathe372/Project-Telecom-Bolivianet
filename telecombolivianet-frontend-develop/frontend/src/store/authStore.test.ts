import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from './authStore';


const SESSION_PAYLOAD = {
  token:                  'eyJhbGciOiJIUzI1NiJ9.test.token',
  userId:                 'uuid-001',
  fullName:               'Administrador',
  email:                  'admin@telecombolivianet.bo',
  role:                   'Admin' as const,
  requiresPasswordChange: false,
};

describe('useAuthStore — setSession', () => {
  beforeEach(() => {
    useAuthStore.setState({
      token:                  null,
      userId:                 null,
      fullName:               null,
      email:                  null,
      role:                   null,
      requiresPasswordChange: false,
    });
  });

  it('TC-STORE-01 — setSession persiste todos los campos', () => {
    useAuthStore.getState().setSession(SESSION_PAYLOAD);

    const state = useAuthStore.getState();
    expect(state.token).toBe(SESSION_PAYLOAD.token);
    expect(state.userId).toBe(SESSION_PAYLOAD.userId);
    expect(state.fullName).toBe(SESSION_PAYLOAD.fullName);
    expect(state.email).toBe(SESSION_PAYLOAD.email);
    expect(state.role).toBe('Admin');
    expect(state.requiresPasswordChange).toBe(false);
  });

  it('TC-STORE-02 — setSession con requiresPasswordChange=true lo persiste', () => {
    useAuthStore.getState().setSession({
      ...SESSION_PAYLOAD,
      requiresPasswordChange: true,
    });

    expect(useAuthStore.getState().requiresPasswordChange).toBe(true);
  });
});

describe('useAuthStore — clearSession', () => {
  beforeEach(() => {
    useAuthStore.getState().setSession(SESSION_PAYLOAD);
  });

  it('TC-STORE-03 — clearSession limpia todos los campos', () => {
    useAuthStore.getState().clearSession();

    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.userId).toBeNull();
    expect(state.fullName).toBeNull();
    expect(state.email).toBeNull();
    expect(state.role).toBeNull();
    expect(state.requiresPasswordChange).toBe(false);
  });
});

describe('useAuthStore — isAuthenticated', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: null, userId: null, fullName: null, email: null, role: null, requiresPasswordChange: false });
  });

  it('TC-STORE-04 — isAuthenticated retorna false si no hay token', () => {
    expect(useAuthStore.getState().isAuthenticated()).toBe(false);
  });

  it('TC-STORE-05 — isAuthenticated retorna true cuando hay token', () => {
    useAuthStore.getState().setSession(SESSION_PAYLOAD);
    expect(useAuthStore.getState().isAuthenticated()).toBe(true);
  });

  it('TC-STORE-06 — isAuthenticated retorna false después de clearSession', () => {
    useAuthStore.getState().setSession(SESSION_PAYLOAD);
    useAuthStore.getState().clearSession();
    expect(useAuthStore.getState().isAuthenticated()).toBe(false);
  });
});

describe('useAuthStore — role helpers', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: null, userId: null, fullName: null, email: null, role: null, requiresPasswordChange: false });
  });

  it('TC-STORE-07 — isAdmin retorna true solo para rol Admin', () => {
    useAuthStore.getState().setSession({ ...SESSION_PAYLOAD, role: 'Admin' });
    expect(useAuthStore.getState().isAdmin()).toBe(true);
    expect(useAuthStore.getState().isTecnico()).toBe(false);
  });

  it('TC-STORE-08 — isTecnico retorna true solo para rol Tecnico', () => {
    useAuthStore.getState().setSession({ ...SESSION_PAYLOAD, role: 'Tecnico' });
    expect(useAuthStore.getState().isTecnico()).toBe(true);
    expect(useAuthStore.getState().isAdmin()).toBe(false);
  });

  it('TC-STORE-09 — isSocioLectura retorna true para rol SocioLectura', () => {
    useAuthStore.getState().setSession({ ...SESSION_PAYLOAD, role: 'SocioLectura' });
    expect(useAuthStore.getState().isSocioLectura()).toBe(true);
    expect(useAuthStore.getState().isAdmin()).toBe(false);
  });
});

describe('useAuthStore — updateToken', () => {
  beforeEach(() => {
    useAuthStore.getState().setSession(SESSION_PAYLOAD);
  });

  it('TC-STORE-10 — updateToken reemplaza solo el token, conserva los demás campos', () => {
    useAuthStore.getState().updateToken('nuevo.token.rotado');

    const state = useAuthStore.getState();
    expect(state.token).toBe('nuevo.token.rotado');
    expect(state.fullName).toBe(SESSION_PAYLOAD.fullName);
    expect(state.email).toBe(SESSION_PAYLOAD.email);
    expect(state.role).toBe('Admin');
  });
});

describe('useAuthStore — setPasswordChanged', () => {
  it('TC-STORE-11 — setPasswordChanged pone requiresPasswordChange en false', () => {
    useAuthStore.getState().setSession({ ...SESSION_PAYLOAD, requiresPasswordChange: true });

    useAuthStore.getState().setPasswordChanged();

    expect(useAuthStore.getState().requiresPasswordChange).toBe(false);
  });
});
