import { z } from 'zod';

const envSchema = z.object({
  VITE_API_URL: z.string().optional().default(''),
});

const _parsed = envSchema.safeParse({
  VITE_API_URL: import.meta.env.VITE_API_URL,
});

if (!_parsed.success) {
  const issues = _parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`[env] Variables de entorno inválidas:\n${issues}`);
}

export const env = _parsed.data;
