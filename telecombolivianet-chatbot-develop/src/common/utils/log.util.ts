export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '***';
  const s = String(phone);
  if (s.length < 6) return '***';
  return s.slice(0, 3) + '****' + s.slice(-2);
}

export function structLog(event: string, fields: Record<string, unknown> = {}): string {
  return JSON.stringify({ event, ...fields });
}
