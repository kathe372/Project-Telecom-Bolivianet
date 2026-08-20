import { ROLE_LABELS, ROLE_COLORS, type UserRoleKey } from '@/services/userService';

export const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    Activo:              'badge-active',
    Bloqueado:           'badge-blocked',
    Inactivo:            'badge-inactive',
    PendienteActivacion: 'bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full font-medium',
  };
  const labels: Record<string, string> = {
    Activo:              'Activo',
    Bloqueado:           'Bloqueado',
    Inactivo:            'Inactivo',
    PendienteActivacion: 'Pendiente activación',
  };
  return <span className={map[s] ?? 'badge-inactive'}>{labels[s] ?? s}</span>;
};

export const roleBadge = (r: string) => {
  const colorClass = ROLE_COLORS[r as UserRoleKey] ?? 'bg-gray-100 text-gray-600 border-gray-200';
  const label = ROLE_LABELS[r as UserRoleKey] ?? r;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${colorClass}`}>
      {label}
    </span>
  );
};
