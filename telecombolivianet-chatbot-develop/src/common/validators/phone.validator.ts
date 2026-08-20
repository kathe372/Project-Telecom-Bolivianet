
const PHONE_REGEX = /^\d{7,15}$/;
const BOLIVIA_PREFIX = '591';

export function validatePhone(raw: string): { valid: boolean; normalized: string; error?: string } {
  if (!raw || typeof raw !== 'string') {
    return { valid: false, normalized: '', error: 'Número vacío o inválido' };
  }

  const cleaned = raw.replace(/[\s+\-().]/g, '');

  if (!PHONE_REGEX.test(cleaned)) {
    return {
      valid: false,
      normalized: '',
      error: `Formato de teléfono inválido: "${cleaned.slice(0, 20)}"`,
    };
  }

  const normalized =
    cleaned.startsWith(BOLIVIA_PREFIX) && cleaned.length > BOLIVIA_PREFIX.length + 6
      ? cleaned.slice(BOLIVIA_PREFIX.length)
      : cleaned;

  return { valid: true, normalized };
}

export function assertValidPhone(raw: string): string {
  const result = validatePhone(raw);
  if (!result.valid) throw new Error(result.error);
  return result.normalized;
}
