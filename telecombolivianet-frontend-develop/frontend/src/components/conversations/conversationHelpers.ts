export const fmtTime = (d: string) =>
  new Date(d).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });

export function fmtRelative(d: string): string {
  const diffMs  = Date.now() - new Date(d).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1)  return 'ahora';
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)   return `hace ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7)    return `hace ${diffD} d`;
  return new Date(d).toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit' });
}

export function getInitials(name: string | null, phone: string): string {
  if (!name) return phone.slice(-2);
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : parts[0].slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-green-600', 'bg-purple-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-red-500',
];

export function avatarColor(phone: string): string {
  let hash = 0;
  for (const ch of phone) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
