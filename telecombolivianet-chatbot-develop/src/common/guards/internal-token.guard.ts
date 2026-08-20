import {
  CanActivate, ExecutionContext, Injectable,
  UnauthorizedException, OnModuleInit, Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual, createHash } from 'crypto';

@Injectable()
export class InternalTokenGuard implements CanActivate, OnModuleInit {
  private readonly logger = new Logger(InternalTokenGuard.name);
  private readonly MIN_TOKEN_LENGTH = 32;

  private tokenHash!: Buffer;
  private configured = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const token = this.config.get<string>('sistema.botStaticToken') ?? '';

    if (!token || token.length < this.MIN_TOKEN_LENGTH) {
      this.logger.error(
        `SECURITY: SISTEMA_BOT_STATIC_TOKEN is ${token ? 'too short' : 'not set'}. ` +
        `Admin endpoints are unprotected. Generate with: openssl rand -hex 32`,
      );
      this.configured = false;
      return;
    }

    this.tokenHash  = createHash('sha256').update(token).digest();
    this.configured = true;
    this.logger.log('InternalTokenGuard initialized ✓');
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.configured) {
      throw new UnauthorizedException(
        'El servidor no está configurado para aceptar este tipo de solicitud.',
      );
    }

    const request  = context.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    const authHeader = request.headers['authorization'] ?? '';

    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token de autorización requerido.');
    }

    const provided     = authHeader.slice(7);
    const providedHash = createHash('sha256').update(provided).digest();

    const valid = timingSafeEqual(this.tokenHash, providedHash);
    if (!valid) throw new UnauthorizedException('Token inválido.');

    return true;
  }
}
