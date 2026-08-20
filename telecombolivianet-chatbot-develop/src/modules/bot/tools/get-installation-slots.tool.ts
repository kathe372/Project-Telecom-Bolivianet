import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IInstallationRepository, INSTALLATION_REPOSITORY } from '../../client/sistema-api.interfaces';
import { SessionData } from '../../session/session.service';
import { AgentTool } from './agent-tool.interface';
import { InteractiveIdCodec } from '../intents/interactive-id.codec';
import { isValidPlanId } from '../domain/plan-id.validator';
import { resolverPlanPorNombre } from '../domain/plan-name-resolver';
import { IPlanRepository, PLAN_REPOSITORY } from '../../client/sistema-api.interfaces';

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** "2026-08-06" + "09:00" -> "Jueves 06/08 09:00" — con el día de la semana
 *  es mucho más fácil de leer en un botón que una fecha ISO pelada. Mediodía
 *  UTC explícito para que el cálculo del día de semana no dependa de la zona
 *  horaria del contenedor. */
function formatSlotTitle(fecha: string, hora: string): string {
  const date = new Date(`${fecha}T12:00:00Z`);
  const weekday = WEEKDAYS[date.getUTCDay()];
  const [, month, day] = fecha.split('-');
  return `${weekday} ${day}/${month} ${hora}`;
}

@Injectable()
export class GetInstallationSlotsTool implements AgentTool {
  private readonly logger = new Logger(GetInstallationSlotsTool.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(INSTALLATION_REPOSITORY) private readonly installationRepo: IInstallationRepository,
    private readonly codec: InteractiveIdCodec,
    @Inject(PLAN_REPOSITORY) private readonly planRepo: IPlanRepository,
  ) {}

  getName(): string { return 'get_installation_slots'; }
  requiresIdentification(): boolean { return false; }

  getDeclaration(): object {
    return {
      name: this.getName(),
      description:
        'Muestra los horarios disponibles para instalación (lista con botones), filtrados por plan. ' +
        'Llamar DESPUÉS de que el cliente haya elegido un plan (get_installation_plans). ' +
        'Pasar el plan_id elegido para que los slots reflejen la disponibilidad real.',
      parameters: {
        type: 'OBJECT',
        properties: {
          plan_id: {
            type: 'STRING',
            description:
              'Copiá LITERAL, carácter por carácter, el valor del campo "id" que te devolvió ' +
              'get_installation_plans para el plan elegido — NO lo type-es de memoria ni sigas un ' +
              'patrón parecido a otro UUID que hayas visto antes: cada plan tiene un UUID real y ' +
              'arbitrario, no una numeración correlativa por posición en la lista. Requerido.',
          },
        },
        required: ['plan_id'],
      },
    };
  }

  async execute(args: Record<string, unknown>, session: SessionData): Promise<unknown> {
    const daysAhead = this.config.get<number>('bot.installationDaysAhead') ?? 7;
    // Auditoría 2026-08: session.selectedPlanId (decodificado server-side al
    // tocar el botón del plan, ver bot-orchestrator.service.ts) es más
    // confiable que args.plan_id — mismo criterio que create-installation.tool.ts.
    let planId = (args.plan_id as string | undefined) || session.selectedPlanId || session.planId || undefined;

    // P2.1 (auditoría 2026-08): mismo guard que ya tienen create_installation
    // y change_plan — si el modelo manda un plan_id que no tiene forma de
    // UUID (inventado), fallar con un error claro en vez de devolver
    // disponibilidad vacía/incorrecta en silencio.
    // 14a (2026-08-07): antes de rechazar, intentar resolverlo por NOMBRE.
    //
    // Medido en produccion: el cliente escribio "Cobre" en vez de tocar el
    // boton, el modelo fabrico `plan_id: "cobre-20mb-89bs"` y esta herramienta
    // devolvia un error pidiendole que se corrigiera solo. El modelo ignoro la
    // instruccion y le dijo al cliente "hubo un problema, intenta mas tarde".
    //
    // El nombre esta DENTRO del id fabricado, porque el modelo lo construye a
    // partir de el. Resolverlo nosotros es determinista; pedirselo al modelo,
    // no — ya lo aprendimos cuatro veces hoy.
    let planId2 = planId;
    if (planId2 !== undefined && !isValidPlanId(planId2)) {
      const r = resolverPlanPorNombre(planId2, await this.planRepo.getActivePlans());
      if (r.kind === 'one') {
        this.logger.log(JSON.stringify({
          event: 'plan_id_resuelto_por_nombre', recibido: planId2, resuelto: r.plan.Name,
        }));
        planId2 = r.plan.Id;
      }
    }
    planId = planId2;

    if (planId !== undefined && !isValidPlanId(planId)) {
      return {
        available: false,
        // 17 (2026-08-07): error INTERNO de autocorreccion, no un mensaje para
        // el cliente. Sin esta marca, el guard se aparta y el modelo termina
        // diciendole al cliente "hubo un problema, intenta mas tarde" — que es
        // justo lo que este texto le prohibe.
        errorInterno: true,
        error:
          'plan_id inválido — ESTE ES UN ERROR TUYO, no le digas al cliente que "hubo un problema" ' +
          'ni le pidas que reintente. Corregilo vos mismo AHORA, en este mismo turno, sin mostrarle ' +
          'nada de esto al cliente: llamá get_installation_plans de nuevo y usá el valor exacto del ' +
          'campo "id", no inventes uno.',
      };
    }

    try {
      // PASO 12: máximo 10 filas por límite de la lista de WhatsApp (Paso 8);
      // el backend puede devolver más, se recortan acá, no en el backend.
      const slots = (await this.installationRepo.getInstallationSlots(daysAhead, planId)).slice(0, 10);

      if (slots.length === 0) {
        return {
          available: false,
          message:   'No hay horarios disponibles para los próximos días. Se puede contactar al admin.',
        };
      }

      return {
        available:  true,
        slotCount:  slots.length,
        // No se manda "remaining"/cupos disponibles al agente — es un dato
        // operativo interno, no algo que el cliente necesite ver ni que el
        // agente deba narrar al ofrecer los horarios.
        slots:      slots.map((s) => ({
          date: s.Fecha,
          time: s.HoraInicio,
        })),
        _list: {
          buttonLabel: 'Ver horarios',
          sections: [{
            title: 'Horarios disponibles',
            // No se muestra el cupo restante al cliente (ej. "7 cupo(s)
            // disponible(s)") — es un detalle operativo interno, no algo
            // que un cliente eligiendo un horario necesite ver.
            rows: slots.map((s) => ({
              id:    this.codec.encodeSlot(s.Fecha, s.HoraInicio),
              title: formatSlotTitle(s.Fecha, s.HoraInicio),
            })),
          }],
        },
      };
    } catch (err: any) {
      this.logger.error(`GetInstallationSlotsTool error: ${err.message}`);
      return { available: false, error: `No se pudieron obtener los horarios: ${err.message}` };
    }
  }
}
