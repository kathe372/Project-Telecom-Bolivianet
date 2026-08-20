import { useEffect, useState, useCallback } from 'react';
import {
  UserPlus, Search, Loader2, AlertCircle,
  LockOpen, UserX, UserCheck, Pencil, Mail, X,
} from 'lucide-react';
import { userService } from '@/services/userService';
import type { UserSystemDto } from '@/types/auth.types';
import ConfirmDialog, { type ConfirmState, CONFIRM_CLOSED } from '@/components/shared/ConfirmDialog';
import { usePageTitle } from '@/hooks/usePageTitle';
import { statusBadge, roleBadge } from '@/components/users/userBadges';
import { CreateUserModal } from '@/components/users/CreateUserModal';
import { EditUserModal } from '@/components/users/EditUserModal';

const PAGE_SIZE = 20;

export default function UsersPage() {
  usePageTitle('Usuarios');
  const [users,       setUsers]       = useState<UserSystemDto[]>([]);
  const [total,       setTotal]       = useState(0);
  const [page,        setPage]        = useState(1);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [search,      setSearch]      = useState('');
  const [showCreate,  setShowCreate]  = useState(false);
  const [editTarget,  setEditTarget]  = useState<UserSystemDto | null>(null);
  const [actionError,    setActionError]    = useState('');
  const [confirmDialog,  setConfirmDialog]  = useState<ConfirmState>(CONFIRM_CLOSED);
  const [confirmRunning, setConfirmRunning] = useState(false);
  const closeConfirm = () => { setConfirmDialog(CONFIRM_CLOSED); setConfirmRunning(false); };

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await userService.getAll(page, PAGE_SIZE);
      setUsers(res.Items);
      setTotal(res.TotalCount);
    } catch {
      setError('Error al cargar los usuarios.');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      u.FullName.toLowerCase().includes(q) ||
      u.Email.toLowerCase().includes(q)
    );
  });

  const quickAction = (fn: () => Promise<void>, title: string, message: string) => {
    setActionError('');
    setConfirmDialog({
      open: true, title, message, confirmLabel: 'Confirmar', variant: 'warning',
      onConfirm: async () => {
        setConfirmRunning(true);
        try { await fn(); closeConfirm(); loadUsers(); }
        catch { setActionError('Ocurrió un error. Intenta nuevamente.'); closeConfirm(); }
      },
    });
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-6 max-w-7xl mx-auto">

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Usuarios del sistema</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} usuarios registrados</p>
        </div>
        <button onClick={() => { setShowCreate(true); setActionError(''); }}
          className="btn-primary">
          <UserPlus className="w-4 h-4" />
          Nuevo usuario
        </button>
      </div>

      <div className="relative mb-4 max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por nombre o email..."
          className="input-field pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Fix auditoría: antes este error solo era visible dentro de los modales
          de crear/editar; las acciones rápidas fallidas no daban feedback. */}
      {actionError && !showCreate && !editTarget && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="flex-1">{actionError}</span>
          <button onClick={() => setActionError('')} className="text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando...
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Nombre', 'Correo', 'Rol', 'Estado', 'Último acceso', 'Acciones']
                    .map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-gray-400">
                      No se encontraron usuarios
                    </td>
                  </tr>
                ) : filtered.map((u) => (
                  <tr key={u.Id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{u.FullName}</div>
                      {u.RequiresPasswordChange && (
                        <span className="text-xs text-amber-600">Requiere cambiar contraseña</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{u.Email}</td>
                    <td className="px-4 py-3">{roleBadge(u.Role)}</td>
                    <td className="px-4 py-3">{statusBadge(u.Status)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {u.LastLoginAt
                        ? new Date(u.LastLoginAt).toLocaleString('es-BO')
                        : 'Nunca'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          title="Editar"
                          onClick={() => { setEditTarget(u); setActionError(''); }}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>

                        {u.Status === 'PendienteActivacion' && (
                          <button
                            title="Reenviar email de activación"
                            onClick={() => quickAction(
                              () => userService.resendActivation(u.Id),
                              'Reenviar activación',
                              `¿Reenviar el email de activación a ${u.Email}?`
                            )}
                            className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors"
                          >
                            <Mail className="w-4 h-4" />
                          </button>
                        )}

                        {u.Status === 'Bloqueado' && (
                          <button
                            title="Desbloquear"
                            onClick={() => quickAction(
                              () => userService.unlock(u.Id),
                              'Desbloquear cuenta',
                              `¿Desbloquear la cuenta de ${u.FullName}?`
                            )}
                            className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                          >
                            <LockOpen className="w-4 h-4" />
                          </button>
                        )}

                        {u.Status === 'Activo' ? (
                          <button
                            title="Desactivar"
                            onClick={() => quickAction(
                              () => userService.deactivate(u.Id),
                              'Desactivar cuenta',
                              `¿Desactivar la cuenta de ${u.FullName}?\nEl usuario no podrá iniciar sesión.`
                            )}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            <UserX className="w-4 h-4" />
                          </button>
                        ) : u.Status === 'Inactivo' ? (
                          <button
                            title="Reactivar"
                            onClick={() => quickAction(
                              () => userService.reactivate(u.Id),
                              'Reactivar cuenta',
                              `¿Reactivar la cuenta de ${u.FullName}?`
                            )}
                            className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                          >
                            <UserCheck className="w-4 h-4" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
              <span>Página {page} de {totalPages}</span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="btn-secondary px-3 py-1 text-xs disabled:opacity-40"
                >
                  Anterior
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="btn-secondary px-3 py-1 text-xs disabled:opacity-40"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadUsers(); }}
        />
      )}

      {editTarget && (
        <EditUserModal
          user={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); loadUsers(); }}
        />
      )}

      <ConfirmDialog state={confirmDialog} onClose={closeConfirm} running={confirmRunning} />
    </div>
  );
}
