import { Injectable } from '@nestjs/common';
import { SessionData } from '../../session/session.service';
import { AgentTool } from './agent-tool.interface';
import { MainMenuService } from '../main-menu.service';

/**
 * PASO 6B (2026-08): antes del primer mensaje el menú con botones se envía
 * siempre (bot-orchestrator.service.ts); después, un saludo suelto también
 * lo re-muestra de forma determinística (FirstContactPolicy.isBareGreeting).
 * Esta tool cubre el tercer caso: el cliente NO saluda, pero tampoco queda
 * claro qué necesita — acá la decisión de mostrar el menú sí depende del LLM.
 */
@Injectable()
export class ShowMainMenuTool implements AgentTool {
  constructor(private readonly mainMenu: MainMenuService) {}

  getName(): string { return 'show_main_menu'; }
  requiresIdentification(): boolean { return false; }
  isMutating(): boolean { return false; }

  getDeclaration(): object {
    return {
      name: this.getName(),
      description:
        'Muestra el menú principal con botones (instalación, pagos, soporte técnico, ' +
        'planes, información, etc.). Úsala SOLO cuando no está claro qué necesita el ' +
        'cliente (p.ej. "ayuda", "no sé qué necesito", una pregunta muy genérica) y ' +
        'mostrarle las categorías disponibles lo ayudaría a decidir. ' +
        'NUNCA la uses si el cliente ya pidió algo concreto — en ese caso usa la ' +
        'herramienta específica para esa consulta en lugar de mostrar el menú.',
      parameters: { type: 'OBJECT', properties: {}, required: [] },
    };
  }

  async execute(_args: Record<string, unknown>, session: SessionData): Promise<unknown> {
    await this.mainMenu.sendMenu(session, 'Estas son las opciones en las que te puedo ayudar:');
    return { _mediaDelivered: true };
  }
}
