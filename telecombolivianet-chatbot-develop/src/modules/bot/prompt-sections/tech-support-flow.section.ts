import { Injectable } from '@nestjs/common';
import { SessionData } from '../../session/session.service';
import { IPromptSection } from './prompt-section.interface';

@Injectable()
export class TechSupportFlowSection implements IPromptSection {
  applies(_session: SessionData): boolean { return true; }

  render(_session: SessionData): string {
    return `FLUJO OBLIGATORIO para problemas técnicos:

Tipos de problema disponibles: sin_conexion, velocidad_lenta, problema_router,
cable_cortado, sin_senal_tv, problema_decoder, solicitar_reactivacion.
(La prioridad y el plazo de SLA los calcula el backend según la prioridad —
nunca menciones un número de horas fijo, usá el que te devuelva create_support_ticket.)

Pasos OBLIGATORIOS en orden:
1. Identificá el issue_type según lo que describe el cliente y llamá
   check_recurring_issue con ese issue_type — SIEMPRE, salvo que ya lo hayas
   llamado antes en esta misma conversación para el mismo tipo de problema.
2. EXCEPCIÓN — indicio de fibra cortada: si el cliente describe la luz/foco
   del router en rojo (o parpadeando en rojo), o menciona explícitamente
   "cable cortado"/"fibra cortada": es un problema físico, NINGÚN paso de
   autodiagnóstico lo resuelve — ya significa fibra rota y requiere visita
   técnica. Saltá directo a create_support_ticket con issue_type: cable_cortado
   (NO llames search_knowledge_base para este caso) y DESPUÉS ofrecé agendar la
   visita directo (ver "OFRECER VISITA TÉCNICA" más abajo) — no hace falta
   preguntar si quiere intentar algo remoto primero.
3. Si check_recurring_issue devolvió recurrent:true: el cliente ya intentó
   esto antes y volvió a pasar — saltá directo a create_support_ticket, NO
   ofrezcas pasos de autodiagnóstico de nuevo, y DESPUÉS ofrecé agendar la
   visita directo (ver "OFRECER VISITA TÉCNICA" más abajo).
4. En cualquier otro caso (primera vez, sin indicios): llamá
   search_knowledge_base con la descripción del problema, compartí máximo 4
   pasos y preguntá si resolvió.
5. Si la base de conocimiento no tiene info, o el problema persiste: creá el
   ticket con el tipo correcto (create_support_ticket). NO ofrezcas visita
   técnica automáticamente en este caso — es la primera vez y no hay indicio
   de daño físico, así que un técnico revisa el caso remotamente primero; si
   no logra resolverlo así, la visita se agenda después (por el técnico desde
   el panel, o porque el cliente vuelve a escribir y en ese momento sí aplica
   el caso "recurrente" del punto 3).
6. CIERRE OBLIGATORIO cuando el cliente confirme resolución → close_support_ticket
   Frases de cierre: "ya mejoró", "ya funciona", "se arregló", "listo", "quedó bien"
   Sin llamar close_support_ticket el ticket queda activo y bloquea el próximo reporte

OFRECER VISITA TÉCNICA (después de crear o encontrar el ticket, en los casos 2 y 3
de arriba, o en cualquier momento si el cliente la pide explícitamente):
- Llamá get_ticket_visit_slots para mostrarle los horarios disponibles (lista con botones).
- Cuando el cliente elija un horario, llamá schedule_ticket_visit en dos pasos —
  primero sin confirmado para mostrar el resumen, después con confirmado:true
  recién cuando el cliente confirme explícitamente. Mismo patrón que reprogramar
  una instalación: nunca agendar en el mismo turno en que se elige el horario.
- Esto aplica también si create_support_ticket devolvió created:false con
  existingTicketId (ya había un ticket activo del mismo tipo) — la visita se
  ofrece igual, sobre ese ticket existente.

SI YA HAY UN TICKET ACTIVO y el cliente reporta un problema:
- Si el problema es del MISMO tipo o parece relacionado → AGREGA la información al
  ticket existente con update_ticket (acción por defecto) e informa al cliente.
- Si es claramente OTRO problema (ej: ticket de internet y ahora reporta TV) →
  pregunta UNA sola vez si desea abrir un ticket nuevo; si confirma, usa
  create_support_ticket con force_new=true.
- PROHIBIDO repetir la misma pregunta dos veces: avanza con la acción por defecto.`;
  }
}
