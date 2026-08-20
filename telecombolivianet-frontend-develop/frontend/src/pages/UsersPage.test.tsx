import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UsersPage from './UsersPage';
import { userService } from '@/services/userService';

vi.mock('@/services/userService', () => ({
  userService: {
    getAll:           vi.fn(),
    create:           vi.fn(),
    update:           vi.fn(),
    unlock:           vi.fn(),
    deactivate:       vi.fn(),
    reactivate:       vi.fn(),
    resendActivation: vi.fn(),
  },
  ROLE_LABELS: { Admin: 'Administrador', Tecnico: 'Técnico', SocioLectura: 'Socio' },
  ROLE_COLORS: {
    Admin: 'bg-purple-100 text-purple-800 border-purple-200',
    Tecnico: 'bg-blue-100 text-blue-800 border-blue-200',
    SocioLectura: 'bg-gray-100 text-gray-600 border-gray-200',
  },
}));

vi.mock('@/hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }));

const makeUser = (over: Partial<Record<string, unknown>> = {}) => ({
  Id: 'u1', FullName: 'Carlos Mamani', Email: 'carlos@tbn.bo',
  Role: 'Tecnico', Status: 'Activo', LastLoginAt: null,
  RequiresPasswordChange: false, Phone: '59171435981',
  ...over,
});

const PAGED = (items: unknown[]) => ({ Items: items, TotalCount: items.length });

beforeEach(() => {
  vi.clearAllMocks();
  (userService.getAll as ReturnType<typeof vi.fn>).mockResolvedValue(PAGED([makeUser()]));
  (userService.create as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (userService.unlock as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
});

describe('UsersPage — TC-FE-USR-01 a TC-FE-USR-07 (red de seguridad refactor C4)', () => {
  it('TC-FE-USR-01 — lista usuarios con nombre, email, rol y estado', async () => {
    render(<UsersPage />);
    expect(await screen.findByText('Carlos Mamani')).toBeInTheDocument();
    expect(screen.getByText('carlos@tbn.bo')).toBeInTheDocument();
    expect(screen.getByText('Técnico')).toBeInTheDocument();
    expect(screen.getByText(/1 usuarios registrados/)).toBeInTheDocument();
  });

  it('TC-FE-USR-02 — muestra error si la carga falla', async () => {
    (userService.getAll as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('500'));
    render(<UsersPage />);
    expect(await screen.findByText('Error al cargar los usuarios.')).toBeInTheDocument();
  });

  it('TC-FE-USR-03 — la búsqueda filtra por nombre/email en cliente', async () => {
    (userService.getAll as ReturnType<typeof vi.fn>).mockResolvedValue(PAGED([
      makeUser(), makeUser({ Id: 'u2', FullName: 'Lucía Flores', Email: 'lucia@tbn.bo', Role: 'Admin' }),
    ]));
    render(<UsersPage />);
    await screen.findByText('Carlos Mamani');
    fireEvent.change(screen.getByPlaceholderText('Buscar por nombre o email...'), {
      target: { value: 'lucia' },
    });
    expect(screen.getByText('Lucía Flores')).toBeInTheDocument();
    expect(screen.queryByText('Carlos Mamani')).not.toBeInTheDocument();
  });

  it('TC-FE-USR-04 — crear usuario valida campos con zod antes de llamar al servicio', async () => {
    render(<UsersPage />);
    await screen.findByText('Carlos Mamani');
    fireEvent.click(screen.getByRole('button', { name: /Nuevo usuario/ }));
    expect(await screen.findByText('Nuevo usuario', { selector: 'h3' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Crear usuario/ }));
    expect(await screen.findByText('Email inválido')).toBeInTheDocument();
    expect(userService.create).not.toHaveBeenCalled();
  });

  it('TC-FE-USR-05 — crear usuario válido llama al servicio y cierra el modal', async () => {
    render(<UsersPage />);
    await screen.findByText('Carlos Mamani');
    fireEvent.click(screen.getByRole('button', { name: /Nuevo usuario/ }));
    await screen.findByText('Nuevo usuario', { selector: 'h3' });

    fireEvent.change(screen.getByPlaceholderText('Juan Pérez López'), { target: { value: 'Ana Rojas' } });
    fireEvent.change(screen.getByPlaceholderText('juan@telecombolivianet.bo'), { target: { value: 'ana@tbn.bo' } });
    fireEvent.change(screen.getByPlaceholderText('Mínimo 8 caracteres'), { target: { value: 'Passw0rd' } });
    fireEvent.change(screen.getByDisplayValue('Selecciona un rol'), { target: { value: 'Tecnico' } });

    fireEvent.click(screen.getByRole('button', { name: /Crear usuario/ }));
    await waitFor(() => expect(userService.create).toHaveBeenCalledWith(expect.objectContaining({
      FullName: 'Ana Rojas', Email: 'ana@tbn.bo', Role: 'Tecnico',
    })));
    await waitFor(() =>
      expect(screen.queryByText('Nuevo usuario', { selector: 'h3' })).not.toBeInTheDocument());
  });

  it('TC-FE-USR-06 — editar abre el modal con los datos precargados', async () => {
    render(<UsersPage />);
    await screen.findByText('Carlos Mamani');
    fireEvent.click(screen.getByTitle('Editar'));
    expect(await screen.findByText('Editar usuario', { selector: 'h3' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Carlos Mamani')).toBeInTheDocument();
    expect(screen.getByDisplayValue('carlos@tbn.bo')).toBeInTheDocument();
  });

  it('TC-FE-USR-07 — si una acción rápida falla, el error es VISIBLE en la página', async () => {
    (userService.getAll as ReturnType<typeof vi.fn>).mockResolvedValue(PAGED([
      makeUser({ Status: 'Bloqueado' }),
    ]));
    (userService.unlock as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('500'));
    render(<UsersPage />);
    await screen.findByText('Carlos Mamani');

    fireEvent.click(screen.getByTitle('Desbloquear'));
    expect(await screen.findByText('Desbloquear cuenta')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(userService.unlock).toHaveBeenCalledWith('u1'));
    // Bug detectado en auditoría: actionError solo se renderizaba dentro de los
    // modales de crear/editar; las acciones rápidas fallidas no daban feedback.
    expect(await screen.findByText('Ocurrió un error. Intenta nuevamente.')).toBeInTheDocument();
  });
});
