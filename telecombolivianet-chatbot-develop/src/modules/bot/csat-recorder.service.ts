import { Inject, Injectable, Logger } from '@nestjs/common';
import { ITicketRepository, TICKET_REPOSITORY } from '../client/sistema-api.interfaces';
import { SessionService, SessionData } from '../session/session.service';
import { pendingCsatVigente } from './domain/csat-window';

const ETIQUETA: Record<number, string> = {
  5: 'Excelente', 4: 'Buena', 3: 'Regular', 2: 'Mala', 1: 'Muy mala',
};

export interface CsatResult {
  registrado: boolean;
  mensaje: string;
}

/**
 * Registra la calificación SIN pasar por el modelo.
 *
 * Medido en producción (2026-08-07): el cliente tocó el botón, el `csat:N`
 * llegó perfecto... y el turno murió con un 429 de Gemini. `toolsCalled: []`,
 * respuesta degradada, calificación perdida.
 *
 * El id ya trae la nota resuelta: no hay nada que interpretar. Hacerla depender
 * de una llamada al LLM era ponerle un punto de fallo a un dato que ya teníamos.
 * Acá se escribe directo contra el backend y recién después se agradece — así
 * el agradecimiento no puede existir sin el registro, que es el otro fallo que
 * veníamos arrastrando.
 */
@Injectable()
export class CsatRecorderService {
  private readonly logger = new Logger(CsatRecorderService.name);

  constructor(
    @Inject(TICKET_REPOSITORY) private readonly ticketRepo: ITicketRepository,
    private readonly sessionService: SessionService,
  ) {}

  async record(session: SessionData, score: number): Promise<CsatResult> {
    const ticketId = pendingCsatVigente(session);

    if (!ticketId) {
      // Sin ticket vigente no hay dónde escribirla. Se lo decimos en vez de
      // agradecer una calificación que no se guardó en ninguna parte.
      this.logger.warn(JSON.stringify({
        event: 'csat_sin_ticket_vigente', phone: session.phoneNumber, score,
      }));
      return {
        registrado: false,
        mensaje: 'No encontré a qué atención corresponde esa calificación. ' +
                 '¿Querés contarme cómo te fue y lo registro con un agente?',
      };
    }

    try {
      // D-26: a su columna. Antes iba a RootCause, que es el analisis del
      // tecnico y el backend lo sobrescribe: cada calificacion lo borraba.
      await this.ticketRepo.recordCsat(ticketId, score);
    } catch (err: any) {
      // Nunca agradecer un registro que falló: el cliente creería que su
      // opinión quedó guardada.
      this.logger.error(JSON.stringify({
        event: 'csat_registro_fallido', phone: session.phoneNumber, score, error: err.message,
      }));
      return {
        registrado: false,
        mensaje: 'No pude guardar tu calificación en este momento. ' +
                 'Podés intentarlo de nuevo en un rato.',
      };
    }

    await this.sessionService.patchSession(session.phoneNumber, {
      pendingCsatTicketId: null,
      pendingCsatAt:       null,
    }).catch((err: unknown) =>
      this.logger.warn(`CSAT registrado pero no se pudo limpiar la sesión: ${(err as Error).message}`),
    );

    this.logger.log(JSON.stringify({
      event: 'csat_registrado', phone: session.phoneNumber, score, ticketId,
    }));

    return {
      registrado: true,
      mensaje: score >= 4
        ? `¡Gracias por tu calificación! Me alegra que la atención te haya parecido ${(ETIQUETA[score] ?? '').toLowerCase()}. 🙌`
        : 'Gracias por tu calificación. Lamento que la atención no haya estado a la altura — ' +
          'la registré para que el equipo la revise.',
    };
  }
}
