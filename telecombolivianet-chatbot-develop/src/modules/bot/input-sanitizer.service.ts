import { Injectable, Logger } from '@nestjs/common';
import { ALL_INJECTION_PATTERNS } from './security/injection-patterns';

@Injectable()
export class InputSanitizerService {
  private readonly logger = new Logger(InputSanitizerService.name);

  private static readonly MAX_CHARS = 1_500;

  // BUG-3: patrones EN + ES externalizados en security/injection-patterns.ts
  private static readonly INJECTION_PATTERNS: RegExp[] = ALL_INJECTION_PATTERNS;

  sanitize(raw: string): string {
    if (!raw) return '';

    let text = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    if (text.length > InputSanitizerService.MAX_CHARS) {
      this.logger.warn(`Input truncated: ${text.length} → ${InputSanitizerService.MAX_CHARS} chars`);
      text = text.slice(0, InputSanitizerService.MAX_CHARS) + '…';
    }

    for (const pattern of InputSanitizerService.INJECTION_PATTERNS) {
      if (pattern.test(text)) {
        this.logger.warn(
          `Prompt injection attempt detected. Pattern: ${pattern} | Input preview: ${text.slice(0, 80)}`,
        );
        text = text.replace(pattern, '[mensaje no permitido]');
      }
    }

    return text;
  }

  isLikelyInjection(sanitized: string, original: string): boolean {
    const removedRatio = 1 - sanitized.replace(/\[mensaje no permitido\]/g, '').trim().length / original.length;
    return removedRatio > 0.7;
  }
}
