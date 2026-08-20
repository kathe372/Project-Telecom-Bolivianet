import { Injectable } from '@nestjs/common';
import { SessionData } from '../../session/session.service';
import { IPromptSection } from './prompt-section.interface';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * MEJORA-1D: inyecta el resumen de la conversación anterior cuando el cliente
 * vuelve tras expirar su sesión. Instrucción deliberadamente conservadora:
 * el contexto está disponible si el cliente lo trae a colación, pero el bot
 * no debe abrir con datos viejos ("¿sigues sin internet?" tres días después).
 */
@Injectable()
export class PreviousContextSection implements IPromptSection {

  applies(session: SessionData): boolean {
    return !!session.previousSummary?.trim();
  }

  render(session: SessionData): string {
    const days = session.previousSummaryAt
      ? Math.max(0, Math.round((Date.now() - session.previousSummaryAt) / MS_PER_DAY))
      : null;
    const cuando = days === null ? '' : days === 0 ? ' (hoy)' : days === 1 ? ' (ayer)' : ` (hace ${days} días)`;

    return `CONTEXTO DE LA CONVERSACIÓN ANTERIOR${cuando}:
${session.previousSummary}

Cómo usar este contexto:
- Si el cliente hace referencia a lo anterior ("¿en qué quedamos?", "lo de mi ticket", "seguimos con eso"), respóndele con esta información.
- Si el cliente trae un tema NUEVO, atiéndelo normalmente — NO menciones el tema anterior por iniciativa propia.
- Este resumen puede estar desactualizado: verifica el estado real (deuda, tickets) con tus herramientas antes de afirmar algo.`;
  }
}
