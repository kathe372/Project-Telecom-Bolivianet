import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

const MAX_HOPS = 5;
const TIMEOUT_MS = 5000;
const USER_AGENT = 'Mozilla/5.0 (compatible; TelecomBoliviaNet-Chatbot/1.0)';

/**
 * Resuelve links cortos de Google Maps (goo.gl / maps.app.goo.gl) siguiendo
 * el redirect HTTP manualmente (sin descargar el HTML final) hasta obtener
 * la URL larga real, que ya trae las coordenadas y se puede parsear con
 * parseGoogleMapsUrl(). No cachea: cada link corto es de un solo uso.
 */
@Injectable()
export class GoogleMapsLinkResolverService {
  private readonly logger = new Logger(GoogleMapsLinkResolverService.name);

  async resolveShortLink(url: string): Promise<string | null> {
    let current = url;

    for (let hop = 0; hop < MAX_HOPS; hop++) {
      // En cuanto el redirect nos deja en un dominio que ya no es goo.gl,
      // esa es la URL larga real (con las coordenadas) — no hace falta
      // pedirla de nuevo solo para confirmar que "ya no redirige".
      if (!/goo\.gl/i.test(current)) return current;

      try {
        const res = await axios.get(current, {
          maxRedirects: 0,
          validateStatus: (status) => status >= 200 && status < 400,
          timeout: TIMEOUT_MS,
          headers: { 'User-Agent': USER_AGENT },
        });

        const location = res.headers['location'] as string | undefined;
        if (!location) return current; // 200 sin más redirects -> URL final

        current = location;
      } catch (err: any) {
        this.logger.warn(`No se pudo resolver el link de Google Maps "${url}" (hop ${hop}): ${err.message}`);
        return null;
      }
    }

    this.logger.warn(`Demasiados redirects resolviendo "${url}", se agotaron los ${MAX_HOPS} saltos permitidos`);
    return current;
  }
}
