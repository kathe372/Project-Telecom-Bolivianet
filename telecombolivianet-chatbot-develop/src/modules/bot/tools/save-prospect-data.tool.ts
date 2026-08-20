import { Injectable, Logger } from '@nestjs/common';
import { SessionService, SessionData } from '../../session/session.service';
import { AgentTool } from './agent-tool.interface';

/**
 * Persiste nombre/CI/dirección del prospecto en la sesión apenas el cliente
 * los da, en vez de depender de que el agente los "recuerde" leyendo el
 * historial crudo de la conversación (que solo guarda los últimos N
 * mensajes). Mismo tratamiento que ya tiene session.lastLocation: se guarda
 * una vez y se reinyecta fresco en el prompt en cada turno (ClientInfoSection),
 * así que sobrevive aunque el turno en que se dieron los datos ya haya salido
 * de la ventana de historial.
 */
@Injectable()
export class SaveProspectDataTool implements AgentTool {
  private readonly logger = new Logger(SaveProspectDataTool.name);

  constructor(private readonly sessionService: SessionService) {}

  getName(): string { return 'save_prospect_data'; }
  requiresIdentification(): boolean { return false; }
  isMutating(): boolean { return false; }

  getDeclaration(): object {
    return {
      name: this.getName(),
      description:
        'Guarda el nombre completo, la cédula de identidad, la dirección y/o el teléfono de ' +
        'respaldo que el prospecto (cliente no registrado) va dando durante el flujo de agendar ' +
        'una instalación nueva. Llámala EN CUANTO el cliente te dé cualquiera de estos datos — no ' +
        'esperes a tener todos juntos, y no dependas de recordarlos vos mismo turnos después. ' +
        'Podés llamarla varias veces según vayan llegando los datos; cada llamada solo actualiza ' +
        'los campos que mandes.',
      parameters: {
        type: 'OBJECT',
        properties: {
          nombre_contacto:     { type: 'STRING', description: 'Nombre completo del prospecto, si lo dio.' },
          ci_prospecto:        { type: 'STRING', description: 'Cédula de identidad del prospecto, si la dio.' },
          direccion:           { type: 'STRING', description: 'Dirección exacta de instalación, si la dio.' },
          telefono_respaldo:   {
            type: 'STRING',
            description:
              'Número de contacto alterno (distinto del WhatsApp desde el que escribe) para que el ' +
              'técnico pueda ubicarlo el día de la instalación si no contesta el WhatsApp principal, ' +
              'si lo dio.',
          },
        },
        required: [],
      },
    };
  }

  async execute(args: Record<string, unknown>, session: SessionData): Promise<unknown> {
    const nombre    = (args.nombre_contacto   as string)?.trim() || undefined;
    const ci        = (args.ci_prospecto      as string)?.trim() || undefined;
    const direccion = (args.direccion         as string)?.trim() || undefined;
    const respaldo  = (args.telefono_respaldo as string)?.trim() || undefined;

    if (!nombre && !ci && !direccion && !respaldo) {
      return { saved: false, error: 'No se recibió ningún dato para guardar.' };
    }

    const patch: Partial<SessionData> = {};
    if (nombre)    patch.prospectName         = nombre;
    if (ci)        patch.prospectIdentityCard = ci;
    if (direccion) patch.prospectAddress      = direccion;
    if (respaldo)  patch.prospectBackupPhone  = respaldo;

    try {
      await this.sessionService.updateSession(session.phoneNumber, patch);
      return {
        saved: true,
        current: {
          nombre_contacto:   nombre    ?? session.prospectName         ?? null,
          ci_prospecto:      ci        ?? session.prospectIdentityCard ?? null,
          direccion:         direccion ?? session.prospectAddress      ?? null,
          telefono_respaldo: respaldo  ?? session.prospectBackupPhone  ?? null,
        },
      };
    } catch (err: any) {
      this.logger.error(`SaveProspectDataTool error: ${err.message}`);
      return { saved: false, error: `No se pudo guardar: ${err.message}` };
    }
  }
}
