import { SessionData } from '../../session/session.service';

export const AGENT_TOOLS   = Symbol('AGENT_TOOLS');
export const ESCALATE_TOOL = 'escalate_to_agent';

export interface AgentTool {
  getName(): string;
  requiresIdentification(): boolean;
  /** true si la herramienta ESCRIBE en el sistema (crear/cerrar/cambiar/cancelar).
   *  El agente solo puede confirmar acciones cuando una herramienta mutante tuvo éxito. */
  isMutating?(): boolean;
  getDeclaration(): object;
  execute(args: Record<string, unknown>, session: SessionData): Promise<unknown>;
}
