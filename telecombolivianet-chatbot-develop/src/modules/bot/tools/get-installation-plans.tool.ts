import { Inject, Injectable, Logger } from '@nestjs/common';
import { IPlanRepository, PLAN_REPOSITORY } from '../../client/sistema-api.interfaces';
import { SessionData, SessionService } from '../../session/session.service';
import { AgentTool } from './agent-tool.interface';
import { InteractiveIdCodec } from '../intents/interactive-id.codec';

/**
 * PASO 8 (2026-08): tool separada de get_available_plans, a propósito.
 * get_available_plans es compartida por preguntas informativas y por
 * change_plan — si devolviera siempre una lista con botones, una pregunta
 * de curiosidad ("¿qué planes tienen?") también mostraría botones, y tocar
 * uno se podría malinterpretar como el arranque de un cambio de plan real.
 * Esta tool solo se llama dentro del flujo de agendar instalación (PASO 12),
 * donde el contexto ya deja claro que la intención es transaccional.
 *
 * Nota: no incluye costo de instalación todavía — ese campo (Plan.InstallationCost)
 * es el PASO 9, pendiente de decisión de producto. Cuando exista, se agrega
 * a la descripción de cada fila.
 */
@Injectable()
export class GetInstallationPlansTool implements AgentTool {
  private readonly logger = new Logger(GetInstallationPlansTool.name);

  constructor(
    @Inject(PLAN_REPOSITORY) private readonly planRepo: IPlanRepository,
    private readonly codec: InteractiveIdCodec,
    private readonly sessionService: SessionService,
  ) {}

  getName(): string { return 'get_installation_plans'; }
  requiresIdentification(): boolean { return false; }

  getDeclaration(): object {
    return {
      name: this.getName(),
      description:
        'Muestra los planes disponibles como una lista con botones, para que el cliente elija uno. ' +
        'Usar SOLO dentro del flujo de agendar una instalación nueva, después de confirmar cobertura ' +
        '(check_coverage). Para preguntas informativas ("¿qué planes tienen?", "¿cuánto cuesta X?") o ' +
        'para un cambio de plan de un cliente existente, usar get_available_plans en su lugar, NO esta.',
      parameters: { type: 'OBJECT', properties: {}, required: [] },
    };
  }

  async execute(_args: Record<string, unknown>, session: SessionData): Promise<unknown> {
    try {
      const plans = await this.planRepo.getActivePlans();

      if (plans.length === 0) {
        return {
          available: false,
          message:   'No hay planes disponibles en este momento. Contacta a un agente para más información.',
        };
      }

      if (!session.plansShown) {
        await this.sessionService.updateSession(session.phoneNumber, { plansShown: true });
      }

      return {
        available: true,
        note:
          'El cliente ya ve estos planes como una lista con botones — no los repitas en texto. ' +
          'El nombre de cada plan YA incluye su velocidad (ej. "COBRE 20MB") — no la repitas por separado.',
        plans: plans.map((p) => ({
          id:           p.Id,
          name:         p.Name,
          speedMbps:    p.SpeedMbps,
          priceMonthly: p.PriceMonthly,
        })),
        _list: {
          buttonLabel: 'Ver planes',
          sections: [{
            title: 'Planes disponibles',
            rows: plans.map((p) => ({
              id:          this.codec.encodePlan(p.Id),
              // p.Name ya incluye la velocidad (ej. "COBRE 20MB") — agregarla
              // de nuevo acá duplicaba el dato con capitalización distinta
              // ("COBRE 20MB — 20 Mb").
              title:       p.Name,
              description: `Bs.${p.PriceMonthly}/mes`,
            })),
          }],
        },
      };
    } catch (err: any) {
      this.logger.error(`GetInstallationPlansTool error: ${err.message}`);
      return { available: false, error: `No se pudieron obtener los planes: ${err.message}` };
    }
  }
}
