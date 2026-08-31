import * as crypto from 'crypto';

export type ResultadoFirma = 'valida' | 'ausente' | 'invalida';

/**
 * Verifica la firma HMAC que Meta envía en X-Hub-Signature-256.
 *
 * Vive aparte porque la comprueban DOS sitios —el middleware que protege la
 * ruta y el propio controlador— y si esas dos copias se separaran, la que
 * corre primero decidiría quién entra. Una sola función es lo que impide que
 * eso ocurra en silencio.
 */
export function verificarFirmaWebhook(
  rawBody: Buffer | string | undefined,
  firmaRecibida: string | undefined,
  appSecret: string,
): ResultadoFirma {
  if (!firmaRecibida) return 'ausente';

  const esperado = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody ?? '')
    .digest('hex');

  const esperadoBuf = Buffer.from(`sha256=${esperado}`);
  const recibidoBuf = Buffer.from(firmaRecibida);

  // La comparación en tiempo constante exige longitudes iguales; comprobarlas
  // antes no filtra nada útil, porque la longitud del hash es pública.
  const valida =
    esperadoBuf.length === recibidoBuf.length &&
    crypto.timingSafeEqual(esperadoBuf, recibidoBuf);

  return valida ? 'valida' : 'invalida';
}
