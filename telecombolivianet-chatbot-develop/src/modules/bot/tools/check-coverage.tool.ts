import { Injectable, Logger } from '@nestjs/common';
import { SessionData } from '../../session/session.service';
import { AgentTool } from './agent-tool.interface';
import { Inject } from '@nestjs/common';
import { IPlanRepository, PLAN_REPOSITORY, IInstallationRepository, INSTALLATION_REPOSITORY } from '../../client/sistema-api.interfaces';
import { InteractiveIdCodec } from '../intents/interactive-id.codec';
import { CoverageService } from '../../coverage/coverage.service';
import { parseGoogleMapsUrl } from '../../coverage/location-parser.util';
import type { LocationInput, CoverageCheckOutcome } from '../../coverage/coverage.interfaces';

const OUTCOME_TO_COVERED: Record<CoverageCheckOutcome, string> = {
  CONFIRMED:   'true',
  NO_COVERAGE: 'false',
  ESCALATE:    'unverified',
  NO_COORDS:   'no_location',
};

@Injectable()
export class CheckCoverageTool implements AgentTool {
  private readonly logger = new Logger(CheckCoverageTool.name);

  constructor(
    private readonly coverageService: CoverageService,
    @Inject(PLAN_REPOSITORY)         private readonly planRepo:         IPlanRepository,
    @Inject(INSTALLATION_REPOSITORY) private readonly installationRepo: IInstallationRepository,
    private readonly codec: InteractiveIdCodec,
  ) {}

  getName(): string { return 'check_coverage'; }
  requiresIdentification(): boolean { return false; }

  getDeclaration(): object {
    return {
      name: this.getName(),
      description:
        'Verifica si hay cobertura de fibra óptica en la ubicación del cliente. ' +
        'SIEMPRE llamar como PRIMER paso antes de mostrar horarios o agendar una instalación. ' +
        'Si el cliente ya compartió su ubicación GPS o un enlace de Google Maps en esta ' +
        'conversación, esos datos se usan automáticamente sin necesidad de pasar "address". ' +
        'Devuelve: covered:"true" (cobertura confirmada → proceder), ' +
        'covered:"false" (sin cobertura → NO agendar, informar al cliente), ' +
        'covered:"unverified" (zona no registrada → escalar con agente), ' +
        'covered:"no_location" (sin ubicación → pedir al cliente que comparta).',
      parameters: {
        type: 'OBJECT',
        properties: {
          address: {
            type: 'STRING',
            description:
              'Dirección, zona, barrio o enlace de Google Maps mencionado por el cliente. ' +
              'Omitir si el cliente ya compartió su ubicación GPS directamente.',
          },
        },
        required: [],
      },
    };
  }

  async execute(args: Record<string, unknown>, session: SessionData): Promise<unknown> {
    const address = ((args.address as string) || '').trim();
    const input   = this.buildInput(address);

    try {
      const result  = await this.coverageService.check(input, session);
      const covered = OUTCOME_TO_COVERED[result.outcome];

      const base = {
        covered,
        message: result.message,
        ...(result.lat !== undefined && { lat: result.lat, lng: result.lng }),
      };

      if (covered !== 'true') return base;

      // Hay cobertura: el paso siguiente es SIEMPRE elegir plan. Los planes se
      // adjuntan acá en vez de esperar a que el modelo llame a la herramienta.
      //
      // Medido en producción (2026-08-07): nunca la llamó. Escribió los planes
      // de memoria —sin botones— y despues fabricó `plan_id: "plan_platino"`,
      // porque no tenía los UUID reales. El cliente eligió PLATINO, el resumen
      // decía COBRE y el id enviado era un tercero: los tres desalineados.
      //
      // Es el mismo criterio que ya funcionó cinco veces hoy: poner el dato
      // donde se necesita en vez de pedirle al modelo que vaya a buscarlo.
      const extras: Record<string, unknown> = { ...base };

      try {
        const planes = await this.planRepo.getActivePlans();
        if (planes.length > 0) {
          extras.planes = planes.map((p) => ({
            id: p.Id, nombre: p.Name, mbps: p.DownloadSpeedMbps, precio: p.PriceMonthly,
          }));
          extras.nota_para_el_agente =
            'Los planes ya se le mostraron al cliente como lista con botones. NO los repitas ' +
            'en texto. Usá el campo `id` EXACTO de este resultado como plan_id: no lo inventes.';
          extras._list = {
            buttonLabel: 'Ver planes',
            sections: [{
              title: 'Planes disponibles',
              rows: planes.map((p) => ({
                id:          this.codec.encodePlan(p.Id),
                title:       p.Name,
                description: `Bs.${p.PriceMonthly}/mes`,
              })),
            }],
          };
        }
      } catch (err: any) {
        this.logger.warn(`No se pudieron adjuntar los planes a la cobertura: ${err.message}`);
      }

      // Y si ya tiene una instalación pendiente, avisarlo ACÁ y no seis pasos
      // más tarde, cuando el backend rechace la creación.
      try {
        const yaTiene = session.activeInstallationId
          ?? await this.installationRepo.findScheduledInstallationByPhone(session.phoneNumber);
        if (yaTiene) {
          extras.instalacion_pendiente = true;
          extras.nota_para_el_agente =
            'Este cliente YA tiene una instalación agendada. Decíselo AHORA, antes de pedirle ' +
            'ningún dato, y ofrecele reprogramarla o cancelarla. No inicies un alta nueva.';
          delete extras._list;
        }
      } catch (err: any) {
        this.logger.warn(`No se pudo verificar instalación previa: ${err.message}`);
      }

      return extras;
    } catch (err: any) {
      this.logger.error(`CheckCoverageTool error: ${err.message}`);
      return {
        covered: 'unverified',
        message: 'No pudimos verificar la cobertura en este momento. Un agente te ayudará.',
      };
    }
  }

  private buildInput(address: string): LocationInput {
    if (!address) return { type: 'text', text: '' };
    if (parseGoogleMapsUrl(address)) return { type: 'google_maps_url', url: address };
    return { type: 'text', text: address };
  }
}
