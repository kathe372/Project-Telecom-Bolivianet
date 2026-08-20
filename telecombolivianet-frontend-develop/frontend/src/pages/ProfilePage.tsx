import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, ShieldCheck, User, Loader2, AlertCircle } from 'lucide-react';
import { userService } from '@/services/userService';
import { useAuthStore } from '@/store/authStore';
import { useShallow } from 'zustand/react/shallow';
import { usePageTitle } from '@/hooks/usePageTitle';
import type { UserSystemDto, ProfilePermissionsDto } from '@/types/auth.types';

const PERM_LABELS: Record<string, string> = {
  ver_dashboard:           'Ver dashboard',
  gestionar_clientes:      'Gestionar clientes',
  gestionar_usuarios:      'Gestionar usuarios del sistema',
  verificar_pagos:         'Verificar pagos',
  enviar_notificaciones:   'Enviar notificaciones',
  ver_reportes:            'Ver reportes',
  ver_audit_log:           'Ver registro de auditoría',
  configurar_sistema:      'Configurar el sistema',
  gestionar_tickets:       'Gestionar tickets',
  ver_clientes_asignados:  'Ver clientes asignados',
  actualizar_tickets_propios: 'Actualizar tickets propios',
  registrar_clientes:      'Registrar nuevos clientes',
};

export default function ProfilePage() {
  usePageTitle('Mi Perfil');
  const { fullName, email, role } = useAuthStore(useShallow(s => ({ fullName: s.fullName, email: s.email, role: s.role })));
  const [profile,     setProfile]     = useState<UserSystemDto | null>(null);
  const [permissions, setPermissions] = useState<ProfilePermissionsDto | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [profile, perms] = await Promise.all([
          userService.getProfile(),
          userService.getMyPermissions(),
        ]);
        setProfile(profile);
        if (perms) setPermissions(perms);
      } catch {
        setError('Error al cargar el perfil.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const roleBadgeClass: Record<string, string> = {
    Admin:        'badge-admin',
    Tecnico:      'badge-tecnico',
    SocioLectura: 'badge-socio',
  };
  const roleLabel: Record<string, string> = {
    Admin:        'Administrador',
    Tecnico:      'Técnico',
    SocioLectura: 'Socio (solo lectura)',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando perfil...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Mi perfil</h1>

      {}
      <div className="card p-6 mb-5">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center text-lg font-bold text-blue-700">
            {fullName?.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">{fullName}</h2>
            <p className="text-sm text-gray-500">{email}</p>
            <span className={`${roleBadgeClass[role ?? ''] ?? 'badge-inactive'} mt-1`}>
              {roleLabel[role ?? ''] ?? role}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Cuenta creada</p>
            <p className="text-gray-700">
              {profile?.CreatedAt
                ? new Date(profile.CreatedAt).toLocaleDateString('es-BO')
                : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Último acceso</p>
            <p className="text-gray-700">
              {profile?.LastLoginAt
                ? new Date(profile.LastLoginAt).toLocaleString('es-BO')
                : 'Esta sesión'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Estado</p>
            <p className="text-gray-700">{profile?.Status ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Intentos fallidos</p>
            <p className="text-gray-700">{profile?.FailedLoginAttempts ?? 0}</p>
          </div>
        </div>

        {}
        <div className="mt-5 pt-4 border-t border-gray-100">
          <Link
            to="/change-password"
            className="btn-secondary inline-flex items-center gap-2 text-sm"
          >
            <KeyRound className="w-4 h-4" />
            Cambiar contraseña
          </Link>
        </div>
      </div>

      {}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-5 h-5 text-blue-600" />
          <h3 className="text-sm font-semibold text-gray-900">Permisos de tu rol</h3>
        </div>

        {permissions ? (
          <ul className="space-y-2">
            {permissions.Permissions.map((perm) => (
              <li key={perm} className="flex items-center gap-2 text-sm text-gray-700">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full shrink-0" />
                {PERM_LABELS[perm] ?? perm}
              </li>
            ))}
          </ul>
        ) : (
          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-500">
            <User className="w-4 h-4 inline mr-1.5 text-gray-400" />
            Tu rol de <strong>Socio (lectura)</strong> tiene acceso de solo visualización
            al dashboard y reportes. No puede crear, editar ni eliminar datos.
          </div>
        )}
      </div>
    </div>
  );
}
