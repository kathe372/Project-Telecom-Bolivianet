import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  IInstallationRepository, INSTALLATION_REPOSITORY,
  IPlanRepository, PLAN_REPOSITORY,
} from '../../client/sistema-api.interfaces';
import { SessionService, SessionData } from '../../session/session.service';
import { AdminSignalrNotifierService } from '../../notifications/admin-signalr-notifier.service';
import { AgentTool } from './agent-tool.interface';
import { isValidPlanId } from '../domain/plan-id.validator';
import { customerFacingInstallationRef } from '../domain/installation-reference';

/** Coordenadas crudas tipo "-17.3550441, -66.1629425" o "lat=-17.35, lng=-66.16". */
const SOLO_COORDENADAS = /^\s*(lat=)?-?\d+\.\d+\s*,?\s*(lng=)?\s*-?\d+\.\d+\s*$/i;

@Injectable()
export class CreateInstallationTool implements AgentTool {
  private readonly logger = new Logger(CreateInstallationTool.name);

  constructor(
    @Inject(INSTALLATION_REPOSITORY) private readonly installationRepo: IInstallationRepository,
    @Inject(PLAN_REPOSITORY)         private readonly planRepo:         IPlanRepository,
    private readonly sessionService: SessionService,
    private readonly adminNotifier:  AdminSignalrNotifierService,
  ) {}

  getName(): string { return 'create_installation'; }
  requiresIdentification(): boolean { return false; }
  isMutating(): boolean { return true; }

  getDeclaration(): object {
    return {
      name: this.getName(),
      description:
        'Agenda una instalación de servicio de internet — en DOS pasos obligatorios, nunca uno solo. ' +
        'PASO 1: llamar SIN confirmado (o confirmado=false) — valida los datos y devuelve un resumen ' +
        'con botones de confirmación, SIN agendar nada todavía. Muestra ese resumen tal cual al cliente. ' +
        'PASO 2: recién cuando el cliente confirme explícitamente (toca el botón "Confirmar" o dice ' +
        'claramente que sí), llamar de NUEVO con los MISMOS datos y confirmado=true — ahí sí se agenda. ' +
        'NUNCA llames con confirmado=true en el mismo turno en que el cliente eligió fecha/hora — ' +
        'siempre tiene que haber un resumen de por medio. ' +
        'IMPORTANTE — convierte TÚ MISMO antes de llamar: ' +
        'fecha → YYYY-MM-DD (ej: "6 de mayo" → "2026-05-06", "el miércoles que viene" → calcula la fecha exacta); ' +
        'hora → HH:mm (ej: "después de las 5" → "17:00", "3 de la tarde" → "15:00", "mediodía" → "12:00"). ' +
        'NO pidas de nuevo datos que el cliente ya dio en la conversación. ' +
        'Para prospectos sin plan activo, usa get_installation_plans primero (incluir plan_id).',
      parameters: {
        type: 'OBJECT',
        properties: {
          fecha: {
            type: 'STRING',
            description: 'Fecha de instalación en formato YYYY-MM-DD',
          },
          hora: {
            type: 'STRING',
            description: 'Hora de instalación en formato HH:mm (ej: 09:00)',
          },
          direccion: {
            type: 'STRING',
            description: 'Dirección completa donde se realizará la instalación',
          },
          plan_id: {
            type: 'STRING',
            description:
              'Copiá LITERAL, carácter por carácter, el valor del campo "id" que te devolvió ' +
              'get_installation_plans para el plan elegido — NO lo type-es de memoria ni sigas un ' +
              'patrón parecido a otro UUID que hayas visto antes (ni siquiera en este texto): cada ' +
              'plan tiene un UUID real y arbitrario, no una numeración correlativa por posición en ' +
              'la lista. Si no tenés ese valor a mano, llamá get_installation_plans de nuevo antes ' +
              'de seguir. Requerido para prospectos o clientes sin plan activo.',
          },
          nombre_contacto: {
            type: 'STRING',
            description:
              'Nombre completo de la persona que solicita la instalación, tal como lo dio ' +
              'en la conversación. OBLIGATORIO para prospectos (no clientes registrados): ' +
              'pídelo antes de agendar si aún no lo tienes.',
          },
          ci_prospecto: {
            type: 'STRING',
            description:
              'Cédula de identidad de la persona que solicita la instalación, tal como la dio ' +
              '(puede incluir complemento, ej. "7654321 LP"). OBLIGATORIA para prospectos ' +
              '(no clientes registrados): pídela antes de agendar si aún no la tienes.',
          },
          telefono_respaldo: {
            type: 'STRING',
            description:
              'Teléfono de contacto alterno del prospecto (distinto del WhatsApp desde el que ' +
              'escribe) para que el técnico pueda ubicarlo el día de la instalación si el WhatsApp ' +
              'principal no responde. OBLIGATORIO para prospectos: pídelo antes de agendar si aún ' +
              'no lo tienes.',
          },
          confirmado: {
            type: 'BOOLEAN',
            description:
              'false u omitido: solo valida y muestra el resumen con botones, no agenda nada. ' +
              'true: agenda de verdad — usar SOLO después de que el cliente confirmó explícitamente ' +
              'el resumen del paso anterior.',
          },
        },
        required: ['fecha', 'hora', 'direccion'],
      },
    };
  }

  /**
   * C4: nombre y precio del plan que REALMENTE se va a agendar. Falla en
   * blando: si la consulta no responde, el resumen sale sin la línea del plan
   * en vez de bloquear el agendamiento.
   */
  private async describirPlan(planId: string | null): Promise<{ texto: string } | null> {
    if (!planId) return null;
    try {
      const planes = await this.planRepo.getActivePlans();
      const plan   = planes.find((p) => p.Id === planId);
      if (!plan) {
        this.logger.warn(`describirPlan: ${planId} no está entre los planes activos`);
        return null;
      }
      const velocidad = plan.SpeedMbps ? `${plan.SpeedMbps} Mbps · ` : '';
      return { texto: `${plan.Name} (${velocidad}Bs. ${plan.PriceMonthly}/mes)` };
    } catch (err: any) {
      this.logger.warn(`describirPlan falló para ${planId}: ${err.message}`);
      return null;
    }
  }

  /** C4: unas coordenadas crudas no son una dirección legible para el cliente. */
  private describirDireccion(direccion: string): string {
    return SOLO_COORDENADAS.test(direccion)
      ? `la ubicación que compartiste por GPS (${direccion.replace(/lat=|lng=/gi, '').trim()})`
      : direccion;
  }

  async execute(args: Record<string, unknown>, session: SessionData): Promise<unknown> {
    const fecha       = (args.fecha       as string) || '';
    const hora         = (args.hora        as string) || '';
    // Red de seguridad: si el agente no manda direccion/nombre/CI en este
    // llamado (p. ej. se le "olvidó" arrastrarlos), se recuperan de lo que
    // ya se guardó con save_prospect_data en vez de fallar en seco.
    const direccion    = (args.direccion   as string) || session.prospectAddress || '';
    const confirmado   = args.confirmado === true;

    if (!fecha || !hora || !direccion) {
      return { created: false, error: 'Se requiere fecha, hora y dirección para agendar la instalación.' };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return { created: false, error: 'Formato de fecha incorrecto. Usa YYYY-MM-DD (ej: 2025-05-15).' };
    }
    if (!/^\d{2}:\d{2}$/.test(hora)) {
      return { created: false, error: 'Formato de hora incorrecto. Usa HH:mm (ej: 09:00).' };
    }

    // Auditoría 2026-08: session.selectedPlanId es el UUID real, decodificado
    // server-side cuando el cliente tocó el botón del plan (ver
    // bot-orchestrator.service.ts) — no depende de que el modelo lo copie
    // bien de memoria varios turnos después. Si el modelo manda un plan_id
    // que no coincide, la sesión gana (mismo criterio que activeTicketId en
    // update-ticket.tool.ts) — el modelo repetidamente inventaba un slug
    // parecido al nombre del plan (ej. "plan-cobre-123") en vez de copiar el
    // UUID real.
    const argPlanId = (args.plan_id as string) || null;
    let resolvedPlanId = argPlanId || session.selectedPlanId || session.planId || null;
    if (session.selectedPlanId && argPlanId && argPlanId !== session.selectedPlanId) {
      // FASE B3 (2026-08-07): evento estructurado, no solo texto. Este warning
      // es la señal más valiosa que tiene el sistema sobre alucinación de
      // identificadores — en UNA sola conversación de prueba se disparó 5
      // veces, con 5 UUIDs distintos, todos sintácticamente válidos. Medirlo
      // permite comprobar si los arreglos de la Fase C lo llevan a cero.
      this.logger.warn(JSON.stringify({
        event:     'fabricated_id_blocked',
        tool:      this.getName(),
        field:     'plan_id',
        fabricado: argPlanId,
        real:      session.selectedPlanId,
      }));
      resolvedPlanId = session.selectedPlanId;
    }
    if (!isValidPlanId(resolvedPlanId)) {
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
          'mostrarle nada de esto al cliente: llamá get_installation_plans, tomá el UUID real (campo ' +
          '"id") del plan que el cliente ya eligió, y volvé a llamar create_installation con ese UUID ' +
          'exacto. NUNCA uses un placeholder como "plan_plata_id" ni un slug como "plan-cobre-89bs".',
      };
    }

    const isProspect        = !session.clientId;
    const prospectName      = (args.nombre_contacto   as string) || session.clientName || session.prospectName || undefined;
    const prospectIdentity  = (args.ci_prospecto      as string) || session.prospectIdentityCard || undefined;
    const prospectBackup    = (args.telefono_respaldo as string) || session.prospectBackupPhone || undefined;

    // PASO 10: mismo criterio bloqueante que ya exige el backend — se valida
    // acá también para dar el mensaje de "qué falta" sin gastar una llamada
    // a la API cuando ya se sabe que va a fallar.
    if (isProspect && !prospectName) {
      return { created: false, error: 'Se requiere el nombre completo del cliente para agendar la instalación.' };
    }
    if (isProspect && !prospectIdentity) {
      return { created: false, error: 'Se requiere la cédula de identidad del cliente para agendar la instalación.' };
    }
    if (isProspect && !prospectBackup) {
      return { created: false, error: 'Se requiere un teléfono de contacto alterno para agendar la instalación.' };
    }

    // PASO 12: guardia de confirmación — nunca agendar en el mismo turno en
    // que se completan los datos. Sin confirmado=true, solo se valida y se
    // devuelve un resumen con botones; el backend nunca se llama.
    if (!confirmado) {
      // FASE C4 (2026-08-07): el resumen decía solo fecha, hora y dirección —
      // nunca el plan ni el precio. Es el último control antes de cerrar un
      // contrato de servicio y omitía justo el producto y su costo.
      //
      // Eso hacía INVISIBLE el hallazgo 12: en producción el cliente tocó COBRE
      // (Bs. 89), el bot le confirmó "PLATINO, Bs. 399/mes", el resumen no
      // mencionó ningún plan, y el sistema agendó COBRE. Bs. 310/mes de
      // diferencia sin un solo momento en que el cliente pudiera notarlo.
      //
      // El plan se resuelve desde resolvedPlanId (la sesión), NO desde lo que
      // diga el modelo: es el mismo valor que se va a persistir.
      const plan = await this.describirPlan(resolvedPlanId);
      const lugar = this.describirDireccion(direccion);

      return {
        created: false,
        pending: true,
        fecha, hora, direccion,
        plan: plan?.texto ?? null,
        message:
          `Confirmá los datos de tu instalación:\n` +
          (plan ? `• Plan: ${plan.texto}\n` : '') +
          `• Fecha: ${fecha} a las ${hora}\n` +
          `• Dirección: ${lugar}\n\n` +
          `¿Confirmás?`,
        nota_para_el_agente:
          'Mostrale este resumen TAL CUAL, con el plan y el precio incluidos. No lo reescribas ' +
          'ni cambies el nombre del plan por otro: es el que el cliente eligió y el que se va a agendar.',
        _quickReplies: [
          { id: 'confirmar_nueva_instalacion', title: '✅ Confirmar' },
          { id: 'cambiar_nueva_instalacion',   title: '✏️ Cambiar' },
          { id: 'cancelar_nueva_instalacion',  title: '❌ Cancelar' },
        ],
      };
    }

    try {
      const result = await this.installationRepo.createInstallation({
        ClienteId:      session.clientId || null,
        PlanId:         resolvedPlanId,
        Fecha:          fecha,
        HoraInicio:     hora,
        Direccion:      direccion,
        Notas:          'Agendado via WhatsApp (agente IA)',
        GpsLatitude:    session.lastLocation?.lat,
        GpsLongitude:   session.lastLocation?.lng,
        LocationSource: session.locationSource ?? undefined,
        // Identidad del prospecto: permite contactarlo (T-1, técnico en campo)
        // aunque la sesión de Redis expire.
        ProspectName:         isProspect ? prospectName     : undefined,
        ProspectPhone:        isProspect ? session.phoneNumber : undefined,
        ProspectIdentityCard: isProspect ? prospectIdentity : undefined,
        ProspectBackupPhone:  isProspect ? prospectBackup   : undefined,
      });

      await this.sessionService.updateSession(session.phoneNumber, {
        activeInstallationId: result.InstalacionId,
        // Ya se usaron para agendar — se limpian para no arrastrarlos a una
        // futura instalación distinta del mismo número (ej. otro prospecto
        // reusando el teléfono, o el mismo cliente agendando de nuevo).
        prospectName:         null,
        prospectIdentityCard: null,
        prospectAddress:      null,
        prospectBackupPhone:  null,
        plansShown:           false,
        selectedPlanId:       null,
      });

      await this.adminNotifier.notifyTicketCreated({
        phoneNumber: session.phoneNumber,
        clientName:  session.clientName ?? 'Prospecto',
        ticketId:    result.InstalacionId,
        priority:    'InstalacionNueva',
      });

      const instalacionRef = customerFacingInstallationRef(result.InstalacionId);
      return {
        created:       true,
        instalacionId: instalacionRef,
        fecha,
        hora,
        direccion,
        message: `Instalación agendada para el ${fecha} a las ${hora} en ${direccion}. ` +
                 `Tu número de referencia es ${instalacionRef}.`,
      };
    } catch (err: any) {
      // El backend manda el motivo real (ej. "El plan seleccionado no existe
      // o está inactivo.") en el body — err.message de axios solo dice
      // "Request failed with status code 400", sin explicar por qué. Sin el
      // motivo real ni el agente ni los logs pueden saber qué corregir.
      const backendMessage = err.response?.data?.message as string | undefined;
      const detail = backendMessage || err.message;
      this.logger.error(`CreateInstallationTool error: ${detail}`);
      return { created: false, error: `No se pudo agendar la instalación: ${detail}` };
    }
  }
}
