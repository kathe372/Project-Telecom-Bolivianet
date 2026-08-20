import { Inject, Injectable, Logger } from '@nestjs/common';
import { IInstallationRepository, INSTALLATION_REPOSITORY } from '../../client/sistema-api.interfaces';
import { SessionData } from '../../session/session.service';
import { AgentTool } from './agent-tool.interface';
import { customerFacingInstallationRef } from '../domain/installation-reference';

@Injectable()
export class RescheduleInstallationTool implements AgentTool {
  private readonly logger = new Logger(RescheduleInstallationTool.name);

  constructor(
    @Inject(INSTALLATION_REPOSITORY) private readonly installationRepo: IInstallationRepository,
  ) {}

  getName(): string { return 'reschedule_installation'; }
  requiresIdentification(): boolean { return false; }
  isMutating(): boolean { return true; }

  getDeclaration(): object {
    return {
      name: this.getName(),
      description:
        'Reprograma la instalación activa del cliente a una nueva fecha y hora — en DOS pasos, ' +
        'nunca uno solo. PASO 1: llamar SIN confirmado (o confirmado=false) — valida y devuelve un ' +
        'resumen con botones de confirmación, SIN reprogramar todavía. PASO 2: recién cuando el ' +
        'cliente confirme explícitamente (toca "Confirmar" o dice claramente que sí), llamar de ' +
        'nuevo con los MISMOS datos y confirmado=true. ' +
        'Usar cuando el cliente quiera cambiar el horario de su instalación existente. ' +
        'La nueva fecha/hora debe estar disponible (usar get_installation_slots antes).',
      parameters: {
        type: 'OBJECT',
        properties: {
          nueva_fecha: {
            type: 'STRING',
            description: 'Nueva fecha en formato YYYY-MM-DD.',
          },
          nueva_hora: {
            type: 'STRING',
            description: 'Nueva hora en formato HH:mm (ej: 14:00).',
          },
          motivo: {
            type: 'STRING',
            description: 'Motivo del cambio (opcional, ej: "No puedo la fecha anterior").',
          },
          confirmado: {
            type: 'BOOLEAN',
            description:
              'false u omitido: solo valida y muestra el resumen con botones, no reprograma nada. ' +
              'true: reprograma de verdad — usar SOLO después de que el cliente confirmó explícitamente.',
          },
        },
        required: ['nueva_fecha', 'nueva_hora'],
      },
    };
  }

  async execute(args: Record<string, unknown>, session: SessionData): Promise<unknown> {
    const nuevaFecha    = (args.nueva_fecha as string) || '';
    const nuevaHora     = (args.nueva_hora  as string) || '';
    const motivo        = (args.motivo      as string) || undefined;
    const confirmado    = args.confirmado === true;
    // 2026-08-07: antes solo miraba la sesion. Un prospecto que vuelve en una
    // conversacion nueva no tiene activeInstallationId, y su instalacion se
    // guarda con ProspectPhone — que nadie consultaba. Resultado medido: el
    // prospecto quedaba atrapado, sin poder consultar, crear ni reprogramar.
    const instalacionId = session.activeInstallationId
      ?? await this.installationRepo.findScheduledInstallationByPhone(session.phoneNumber);

    if (!instalacionId) {
      return { rescheduled: false, error: 'No hay ninguna instalación activa registrada en esta sesión.' };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nuevaFecha)) {
      return { rescheduled: false, error: 'Formato de fecha incorrecto. Usa YYYY-MM-DD.' };
    }
    if (!/^\d{2}:\d{2}$/.test(nuevaHora)) {
      return { rescheduled: false, error: 'Formato de hora incorrecto. Usa HH:mm.' };
    }

    // PASO 13: mismo guardia de confirmación que create_installation (PASO 12)
    // — nunca reprogramar en el mismo turno en que se elige el nuevo horario.
    if (!confirmado) {
      return {
        rescheduled: false,
        pending: true,
        nuevaFecha, nuevaHora,
        message: `Vas a reprogramar tu instalación al ${nuevaFecha} a las ${nuevaHora}. ¿Confirmas?`,
        _quickReplies: [
          { id: 'confirmar_reprogramacion_instalacion', title: '✅ Confirmar reprogramación' },
          { id: 'cancelar_reprogramacion_instalacion',  title: '❌ Cancelar' },
        ],
      };
    }

    try {
      await this.installationRepo.rescheduleInstallation(instalacionId, nuevaFecha, nuevaHora, motivo);

      return {
        rescheduled:   true,
        instalacionId: customerFacingInstallationRef(instalacionId),
        nuevaFecha,
        nuevaHora,
        message: `Tu instalación ha sido reprogramada para el ${nuevaFecha} a las ${nuevaHora}. ` +
                 'Recibirás una confirmación por WhatsApp.',
      };
    } catch (err: any) {
      this.logger.error(`RescheduleInstallationTool error: ${err.message}`);
      return { rescheduled: false, error: `No se pudo reprogramar la instalación: ${err.message}` };
    }
  }
}
