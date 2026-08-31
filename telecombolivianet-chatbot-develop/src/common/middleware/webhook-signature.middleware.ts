import {
  Injectable, NestMiddleware, Logger, HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import { verificarFirmaWebhook } from '../../modules/whatsapp/webhook-signature';

/**
 * Autentica el webhook ANTES de que nadie más toque la petición.
 *
 * El controlador ya comprobaba la firma, pero lo hacía dentro del método: en
 * NestJS el middleware corre antes que el controlador, así que
 * `PhoneRateLimiterMiddleware` leía el teléfono de un cuerpo sin autenticar,
 * lo contaba en Redis y —al pasar del límite— mandaba un WhatsApp real a ese
 * número. Sin credencial alguna se podía:
 *
 *   1. envenenar el contador de un cliente real, para que sus mensajes
 *      legítimos recibieran 429; y
 *   2. hacer que el número verificado de la empresa escribiera a cualquier
 *      teléfono elegido por quien lanzaba la petición.
 *
 * Registrado antes del limitador, nada que no venga firmado por Meta llega a
 * tocar estado. El controlador conserva su propia comprobación: es barata y
 * evita que un cambio de orden en el registro vuelva a abrir el hueco.
 *
 * Las respuestas son EXACTAMENTE las que daba el controlador, para no alterar
 * lo que Meta observa: 401 si falta la firma; 200 silencioso si es inválida
 * —deliberado, porque un error haría que Meta reintentara en bucle—.
 */
@Injectable()
export class WebhookSignatureMiddleware implements NestMiddleware {
  private readonly logger = new Logger(WebhookSignatureMiddleware.name);

  constructor(private readonly config: ConfigService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const appSecret = this.config.get<string>('meta.appSecret');

    if (!appSecret) {
      this.logger.error('META_APP_SECRET no configurado — el webhook no puede verificar firmas');
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Webhook mal configurado: META_APP_SECRET ausente',
      });
      return;
    }

    const resultado = verificarFirmaWebhook(
      (req as Request & { rawBody?: Buffer }).rawBody,
      req.headers['x-hub-signature-256'] as string | undefined,
      appSecret,
    );

    if (resultado === 'ausente') {
      this.logger.warn('Webhook recibido sin X-Hub-Signature-256 — rechazado');
      res.status(HttpStatus.UNAUTHORIZED).json({
        statusCode: HttpStatus.UNAUTHORIZED,
        message: 'Firma X-Hub-Signature-256 requerida',
        error: 'Unauthorized',
      });
      return;
    }

    if (resultado === 'invalida') {
      this.logger.warn('Firma de webhook inválida — payload ignorado');
      res.status(HttpStatus.OK).json({ status: 'ok' });
      return;
    }

    next();
  }
}
