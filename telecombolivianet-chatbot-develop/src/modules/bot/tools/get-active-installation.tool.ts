import { Inject, Injectable, Logger } from '@nestjs/common';
import { IInstallationRepository, INSTALLATION_REPOSITORY } from '../../client/sistema-api.interfaces';
import { SessionData } from '../../session/session.service';
import { AgentTool } from './agent-tool.interface';

/** Estados en los que la instalación ya no es una cita futura que informar. */
const ESTADOS_CERRADOS = ['Completada', 'Cancelada', 'NoRealizada'];

// Los seis valores de InstallationStatus del backend
// (Domain/Entities/Installations/Installation.cs). Si aparece uno nuevo, cae al
// `?? inst.Status` de más abajo: se muestra crudo, nunca se inventa.
const ESTADO_LABEL: Record<string, string> = {
  Pendiente:    '🗓 Agendada — cita confirmada',
  EnProceso:    '🔧 En proceso — el técnico está trabajando',
  Reprogramada: '🗓 Reprogramada — cita confirmada en la nueva fecha',
  Completada:   '✅ Completada',
  Cancelada:    '❌ Cancelada',
  NoRealizada:  '⚠️ No realizada — hay que reprogramarla',
};

/**
 * FASE G5 (2026-08-07) — HALLAZGO 23.
 *
 * Antes, cuando el cliente preguntaba "¿a qué hora vienen a instalarme?", el
 * modelo no tenía ninguna herramienta que devolviera la cita, así que caía en
 * `get_active_ticket` — que devuelve el ticket asociado a la instalación. Ese
 * ticket trae `SlaDeadline`, el plazo INTERNO de atención, no la cita.
 *
 * Medido en producción: la instalación estaba agendada 12:20 y el bot le dijo
 * al cliente **10:20**, que era el vencimiento del SLA. El cliente se organiza
 * en función de esa hora; el técnico llega dos horas después.
 *
 * Esta herramienta lee la instalación de verdad y devuelve la hora agendada.
 */
@Injectable()
export class GetActiveInstallationTool implements AgentTool {
  private readonly logger = new Logger(GetActiveInstallationTool.name);

  constructor(
    @Inject(INSTALLATION_REPOSITORY) private readonly installationRepo: IInstallationRepository,
  ) {}

  getName(): string { return 'get_active_installation'; }
  /** El id vive en la sesión (lo dejó create_installation), no hace falta ser
   *  cliente registrado: un prospecto que agendó todavía no lo es. */
  requiresIdentification(): boolean { return false; }

  getDeclaration(): object {
    return {
      name: this.getName(),
      description:
        'Consulta la INSTALACIÓN agendada del cliente: fecha y hora de la cita, dirección, ' +
        'plan y técnico asignado. Es la ÚNICA fuente correcta para responder ' +
        '"¿a qué hora vienen a instalarme?", "¿cuándo es mi instalación?", ' +
        '"¿qué día me instalan?", "¿ya tienen técnico asignado?". ' +
        'NUNCA uses get_active_ticket para responder la hora de una instalación: ese ticket ' +
        'trae un plazo interno de atención, no la hora de la cita, y dar ese dato hace que el ' +
        'cliente espere al técnico a la hora equivocada.',
      parameters: { type: 'OBJECT', properties: {}, required: [] },
    };
  }

  async execute(_args: Record<string, unknown>, session: SessionData): Promise<unknown> {
    let instalacionId = session.activeInstallationId;

    // La sesión de Redis caduca, y el caso más común es justamente ese: el
    // cliente vuelve AL DÍA SIGUIENTE a preguntar por su cita. Si es un cliente
    // identificado, la buscamos en el backend en vez de decirle que no existe.
    if (!instalacionId) {
      try {
        // Por telefono, no por cliente: un prospecto no tiene clientId y sus
        // instalaciones se guardan con ProspectPhone. Antes esta rama solo
        // corria para clientes, asi que a un prospecto con instalacion vigente
        // se le respondia "no tenes ninguna agendada" — y el duplicado recien
        // aparecia al intentar crearla.
        instalacionId = session.clientId
          ? await this.installationRepo.findScheduledInstallationId(session.clientId)
          : await this.installationRepo.findScheduledInstallationByPhone(session.phoneNumber);
      } catch (err: any) {
        this.logger.warn(`No se pudo buscar la instalación por cliente: ${err.message}`);
      }
    }

    if (!instalacionId) {
      return {
        found: false,
        message: 'No hay ninguna instalación agendada registrada en esta conversación.',
        nota_para_el_agente:
          'No inventes una fecha ni la deduzcas de un ticket. Si el cliente insiste en que sí ' +
          'agendó una instalación, escalá con un agente humano para que la busquen en el sistema.',
      };
    }

    try {
      const inst = await this.installationRepo.getInstallationById(instalacionId);

      if (!inst) {
        return {
          found: false,
          message: 'No se encontró la instalación registrada en esta conversación.',
          nota_para_el_agente: 'No inventes datos de la cita. Ofrecé escalar con un agente.',
        };
      }

      if (ESTADOS_CERRADOS.includes(inst.Status)) {
        return {
          found: true,
          vigente: false,
          estado: ESTADO_LABEL[inst.Status] ?? inst.Status,
          fecha_agendada: inst.Fecha,
          hora_agendada:  inst.HoraInicio,
          nota_para_el_agente:
            `La instalación ya no está vigente (${inst.Status}). No la anuncies como una cita ` +
            `próxima; informá el estado real y ofrecé agendar una nueva si corresponde.`,
        };
      }

      return {
        found:   true,
        vigente: true,
        estado:  ESTADO_LABEL[inst.Status] ?? inst.Status,
        // Estos dos campos SON la cita. Cualquier otra hora que aparezca en el
        // contexto (plazos de ticket, SLA) no lo es.
        fecha_agendada: inst.Fecha,
        hora_agendada:  inst.HoraInicio,
        hora_fin_estimada: inst.HoraFin ?? null,
        plan:      inst.PlanNombre ?? null,
        direccion: inst.Direccion ?? null,
        tecnico:   inst.TecnicoNombre ?? 'Aún sin técnico asignado',
        nota_para_el_agente:
          'Informá al cliente EXACTAMENTE fecha_agendada y hora_agendada. Está prohibido ' +
          'usar cualquier otra hora (plazos de ticket o SLA) como hora de la visita.',
      };
    } catch (err: any) {
      this.logger.error(`GetActiveInstallationTool error: ${err.message}`);
      return { error: `No se pudo consultar la instalación: ${err.message}` };
    }
  }
}
