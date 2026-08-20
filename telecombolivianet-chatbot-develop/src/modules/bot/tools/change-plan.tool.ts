import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  IClientRepository, CLIENT_REPOSITORY,
  IPlanRepository, PLAN_REPOSITORY,
} from '../../client/sistema-api.interfaces';
import { AdminSignalrNotifierService } from '../../notifications/admin-signalr-notifier.service';
import { SessionData } from '../../session/session.service';
import { PlanChangeEffectivityPolicy } from '../domain/plan-change-effectivity';
import { isValidPlanId } from '../domain/plan-id.validator';
import { resolverPlanPorNombre, ResolucionPlan } from '../domain/plan-name-resolver';
import { AgentTool } from './agent-tool.interface';

@Injectable()
export class ChangePlanTool implements AgentTool {
  private readonly logger = new Logger(ChangePlanTool.name);

  constructor(
    @Inject(CLIENT_REPOSITORY) private readonly clientRepo: IClientRepository,
    @Inject(PLAN_REPOSITORY)   private readonly planRepo:   IPlanRepository,
    private readonly adminNotifier: AdminSignalrNotifierService,
    private readonly effectivity:   PlanChangeEffectivityPolicy,
  ) {}

  getName(): string { return 'change_plan'; }
  requiresIdentification(): boolean { return true; }
  isMutating(): boolean { return true; }

  getDeclaration(): object {
    return {
      name: this.getName(),
      description:
        'Registra una solicitud formal de cambio de plan para el cliente. ' +
        'SIEMPRE llamar get_available_plans primero para obtener el plan_id correcto. ' +
        'Solo disponible para clientes registrados.',
      parameters: {
        type: 'OBJECT',
        properties: {
          plan_id: {
            type: 'STRING',
            description:
              'Copiá LITERAL, carácter por carácter, el valor del campo "id" que te devolvió ' +
              'get_available_plans para el plan elegido — NO lo type-es de memoria ni sigas un ' +
              'patrón parecido a otro UUID que hayas visto antes: cada plan tiene un UUID real y ' +
              'arbitrario, no una numeración correlativa. Si no lo tenés a mano, llamá ' +
              'get_available_plans de nuevo antes de seguir. Campo obligatorio.',
          },
          requested_plan: {
            type: 'STRING',
            description: 'Nombre del plan que el cliente quiere (para mostrar en la respuesta)',
          },
          reason: {
            type: 'STRING',
            description: 'Motivo del cambio indicado por el cliente',
          },
        },
        required: ['plan_id', 'requested_plan'],
      },
    };
  }

  /** Normaliza para comparar nombres de plan: sin tildes, sin la palabra "plan". */
  /** Delega en la pieza compartida (domain/plan-name-resolver). Antes vivia
   *  duplicada aca; al extraerla, un test descubrio que no resolvia
   *  "el plan Diamante" — el articulo quedaba pegado al nombre. */
  private async resolverPorNombre(requestedPlan: string): Promise<ResolucionPlan> {
    return resolverPlanPorNombre(requestedPlan, await this.planRepo.getActivePlans());
  }

  async execute(args: Record<string, unknown>, session: SessionData): Promise<unknown> {
    const argPlanId     = ((args.plan_id        as string) || '').trim();
    const requestedPlan = ((args.requested_plan as string) || 'No especificado').trim();
    const reason        = ((args.reason         as string) || 'Solicitud del cliente via WhatsApp').trim();

    // C3: el nombre manda sobre el UUID del modelo.
    let planId = argPlanId;
    try {
      const resuelto = await this.resolverPorNombre(requestedPlan);
      if (resuelto.kind === 'many') {
        return {
          created: false,
          error:
            `"${requestedPlan}" coincide con más de un plan (${resuelto.nombres.join(', ')}). ` +
            `Preguntale al cliente cuál de esos quiere, con esos nombres exactos.`,
        };
      }
      if (resuelto.kind === 'one') {
        if (argPlanId && argPlanId !== resuelto.plan.Id) {
          // FASE B3: mismo evento estructurado que create_installation, para
          // poder medir si los arreglos bajan la fabricación de identificadores.
          this.logger.warn(JSON.stringify({
            event:     'fabricated_id_blocked',
            tool:      this.getName(),
            field:     'plan_id',
            fabricado: argPlanId,
            real:      resuelto.plan.Id,
            porNombre: resuelto.plan.Name,
          }));
        }
        planId = resuelto.plan.Id;
      }
    } catch (err: any) {
      // Si la lista de planes no está disponible, se sigue con el id del modelo
      // y lo validan las guardas de abajo. No vale la pena bloquear por esto.
      this.logger.warn(`No se pudo resolver el plan por nombre: ${err.message}`);
    }

    if (!planId) {
      return { created: false, error: 'Se requiere el ID del plan destino (usa get_available_plans primero).' };
    }
    // PASO 2 (2026-08): valida formato UUID antes de tocar el backend —
    // mismo patrón que create-installation.tool.ts. Sin esto, un plan_id
    // inventado por el LLM (ej. "plan_platinium") llegaba directo al backend
    // y producía el error confuso "El plan que seleccionó no existe o está inactivo".
    if (!isValidPlanId(planId)) {
      return {
        created: false,
        // 17 (2026-08-07): error INTERNO de autocorreccion, no un mensaje para
        // el cliente. Sin esta marca, el guard se aparta y el modelo termina
        // diciendole al cliente "hubo un problema, intenta mas tarde" — que es
        // justo lo que este texto le prohibe.
        errorInterno: true,
        error:
          'plan_id inválido o faltante — ESTE ES UN ERROR TUYO, no le digas al cliente que "hubo un ' +
          'problema" ni le pidas que reintente. Corregilo vos mismo AHORA, en este mismo turno, sin ' +
          'mostrarle nada de esto al cliente: llamá get_available_plans, tomá el UUID real (campo ' +
          '"id") del plan que el cliente ya eligió, y volvé a llamar change_plan con ese UUID exacto. ' +
          'NUNCA uses un placeholder como "plan_platinium" ni un slug parecido al nombre del plan.',
      };
    }
    if (session.planId && session.planId === planId) {
      return { created: false, error: `El cliente ya tiene activo el plan "${requestedPlan}".` };
    }

    try {
      const result = await this.clientRepo.requestPlanChange(
        session.clientId!,
        planId,
        `Plan solicitado: ${requestedPlan}. Motivo: ${reason}. Plan actual: ${session.planName ?? 'N/D'}. Via WhatsApp.`,
      );

      await this.adminNotifier.notifyTicketCreated({
        phoneNumber: session.phoneNumber,
        clientName:  session.clientName ?? 'Desconocido',
        ticketId:    result.changeId,
        priority:    'Media',
      });

      const effectivityMsg = await this.resolveEffectivityMessage(session, planId);

      return {
        created:       true,
        changeId:      result.changeId,
        requestedPlan,
        currentPlan:   session.planName ?? 'N/D',
        message:
          `Solicitud de cambio al plan "${requestedPlan}" registrada correctamente. ` +
          effectivityMsg,
      };
    } catch (err: any) {
      const backendMsg: string = err.response?.data?.message ?? err.message;
      this.logger.error(`ChangePlanTool error: ${backendMsg}`);

      // FASE C3 (2026-08-07): si el backend rechaza el plan por inexistente, es
      // un error DEL MODELO, no del sistema — y antes se devolvía un error
      // genérico, así que el bot le pedía disculpas al cliente y le pedía que
      // repitiera. Repetir fallaba idéntico: bucle cerrado, medido en
      // producción sobre un flujo de upgrade.
      //
      // La instrucción de autocorrección ya existía para el formato inválido;
      // faltaba en esta rama, que es la que se dispara ahora que el modelo
      // fabrica UUIDs sintácticamente válidos.
      const planNoExiste = /no existe|inactiv|not found/i.test(backendMsg);
      if (planNoExiste) {
        return {
        errorInterno: true,   // autocorreccion, no mensaje para el cliente
          created: false,
          error:
            'El plan enviado no existe — ESTE ES UN ERROR TUYO, no le digas al cliente que "hubo un ' +
            'problema" ni le pidas que repita. Corregilo vos mismo AHORA, en este mismo turno: llamá ' +
            'get_available_plans, tomá el UUID real (campo "id") del plan cuyo NOMBRE coincide con lo ' +
            'que pidió el cliente, y volvé a llamar change_plan con ese UUID exacto y el nombre en ' +
            'requested_plan. Si el nombre que pidió no está en la lista, mostrale los planes reales.',
        };
      }
      return { created: false, error: `No se pudo registrar la solicitud: ${backendMsg}` };
    }
  }

  /** BUG-5: upgrade → inmediato; downgrade → fin de mes; sin datos → neutro. */
  private async resolveEffectivityMessage(session: SessionData, targetPlanId: string): Promise<string> {
    try {
      const plans        = await this.planRepo.getActivePlans();
      const currentPrice = plans.find((p) => p.Id === session.planId)?.PriceMonthly ?? null;
      const targetPrice  = plans.find((p) => p.Id === targetPlanId)?.PriceMonthly ?? null;
      return this.effectivity.message(this.effectivity.resolve(currentPrice, targetPrice));
    } catch (err: any) {
      this.logger.warn(`No se pudo resolver vigencia del cambio de plan: ${err.message}`);
      return this.effectivity.message('desconocido');
    }
  }
}
