import { Inject, Injectable, Logger } from '@nestjs/common';
import { IInstallationRepository, INSTALLATION_REPOSITORY } from '../../client/sistema-api.interfaces';
import { SessionService, SessionData } from '../../session/session.service';
import { AgentTool } from './agent-tool.interface';
import { customerFacingInstallationRef } from '../domain/installation-reference';

@Injectable()
export class CancelInstallationTool implements AgentTool {
  private readonly logger = new Logger(CancelInstallationTool.name);

  constructor(
    @Inject(INSTALLATION_REPOSITORY) private readonly installationRepo: IInstallationRepository,
    private readonly sessionService: SessionService,
  ) {}

  getName(): string { return 'cancel_installation'; }
  requiresIdentification(): boolean { return false; }
  isMutating(): boolean { return true; }

  getDeclaration(): object {
    return {
      name: this.getName(),
      description:
        'Cancela la instalación activa del cliente — en DOS pasos, nunca uno solo. ' +
        'PASO 1: llamar SIN confirmado (o confirmado=false) — valida y devuelve un resumen con ' +
        'botones de confirmación, SIN cancelar todavía. PASO 2: recién cuando el cliente confirme ' +
        'explícitamente (toca "Confirmar" o dice claramente que sí), llamar de nuevo con el mismo ' +
        'motivo y confirmado=true. ' +
        'Solo usar cuando el cliente pida explícitamente cancelar su instalación. ' +
        'Requiere motivo de cancelación (texto libre, tal como lo da el cliente). Hay una ' +
        'anticipación mínima configurada (por defecto 24 horas) — si el backend la rechaza, ' +
        'informa el mensaje al cliente y ofrece escalar con un agente.',
      parameters: {
        type: 'OBJECT',
        properties: {
          motivo: {
            type: 'STRING',
            description: 'Motivo de la cancelación (ej: "Cambio de planes", "No puedo ese día").',
          },
          confirmado: {
            type: 'BOOLEAN',
            description:
              'false u omitido: solo valida y muestra el resumen con botones, no cancela nada. ' +
              'true: cancela de verdad — usar SOLO después de que el cliente confirmó explícitamente.',
          },
        },
        required: ['motivo'],
      },
    };
  }

  async execute(args: Record<string, unknown>, session: SessionData): Promise<unknown> {
    const motivo         = (args.motivo as string) || 'Sin motivo especificado';
    const confirmado     = args.confirmado === true;
    // 2026-08-07: antes solo miraba la sesion. Un prospecto que vuelve en una
    // conversacion nueva no tiene activeInstallationId, y su instalacion se
    // guarda con ProspectPhone — que nadie consultaba. Resultado medido: el
    // prospecto quedaba atrapado, sin poder consultar, crear ni reprogramar.
    const instalacionId = session.activeInstallationId
      ?? await this.installationRepo.findScheduledInstallationByPhone(session.phoneNumber);

    if (!instalacionId) {
      return { cancelled: false, error: 'No hay ninguna instalación activa registrada en esta sesión.' };
    }

    // PASO 13: mismo guardia de confirmación que create_installation (PASO 12)
    // — nunca cancelar en el mismo turno en que el cliente da el motivo.
    if (!confirmado) {
      return {
        cancelled: false,
        pending: true,
        motivo,
        message: `Vas a cancelar tu instalación. Motivo: ${motivo}. ¿Confirmas?`,
        _quickReplies: [
          { id: 'confirmar_cancelacion_instalacion', title: '✅ Confirmar cancelación' },
          { id: 'mantener_instalacion_agendada',     title: '❌ Cancelar' },
        ],
      };
    }

    try {
      await this.installationRepo.cancelInstallation(instalacionId, motivo);

      await this.sessionService.updateSession(session.phoneNumber, {
        activeInstallationId: undefined,
      });

      return {
        cancelled:     true,
        instalacionId: customerFacingInstallationRef(instalacionId),
        message: `Tu instalación ha sido cancelada. Motivo: ${motivo}. ` +
                 'Si deseas reagendar en el futuro, con gusto te ayudamos.',
      };
    } catch (err: any) {
      this.logger.error(`CancelInstallationTool error: ${err.message}`);
      const backendMsg: string = err.response?.data?.message ?? '';
      // Regla de anticipación mínima (configurable en backend, default 24 h)
      const isMinNoticeRule = err.response?.status === 422 ||
                              /\d+\s*horas? de anticipaci/i.test(err.message ?? '') ||
                              /\d+\s*horas? de anticipaci/i.test(backendMsg);
      if (isMinNoticeRule) {
        const detalle = backendMsg || err.message ||
          'No se puede cancelar con tan poca anticipación.';
        // PASO 13: la ruta a un agente ahora es un botón, no algo que el
        // cliente tenga que pedir por su cuenta (mismo intent ya existente
        // 'solicitar_agente', sin agregar uno nuevo).
        return {
          cancelled: false,
          error: `${detalle} Te transfiero con un agente para que revise tu caso.`,
          _quickReplies: [
            { id: 'solicitar_agente', title: '👤 Hablar con agente' },
          ],
        };
      }
      return { cancelled: false, error: `No se pudo cancelar la instalación: ${err.message}` };
    }
  }
}
