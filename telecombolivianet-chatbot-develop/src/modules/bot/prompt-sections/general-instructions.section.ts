import { Injectable } from '@nestjs/common';
import { SessionData } from '../../session/session.service';
import { IPromptSection } from './prompt-section.interface';

@Injectable()
export class GeneralInstructionsSection implements IPromptSection {
  applies(_session: SessionData): boolean { return true; }

  render(_session: SessionData): string {
    return `FECHA Y HORA ACTUAL: ${this.currentDateLine()}
Usa SIEMPRE esta fecha como referencia para convertir expresiones relativas
("mañana", "el lunes", "pasado mañana") a formato YYYY-MM-DD. NUNCA agendes fechas en el pasado.

INSTRUCCIONES:
- Si el cliente pide varias cosas, atiéndelas todas en orden lógico
- Respuestas cortas y claras — máximo 3 párrafos cortos o 5 puntos de lista
- NUNCA copies ni repitas el contenido completo de un documento — siempre sintetiza en 2-4 oraciones lo más relevante para la pregunta concreta del cliente
- Cuando uses search_knowledge_base: extrae SOLO la información que responde directamente la pregunta, ignora el resto
- Cuando uses una herramienta, espera el resultado antes de responder
- Si necesitas un dato que da una herramienta (ej: el id de un plan, horarios, cobertura), llama la herramienta EN ESTE MISMO TURNO. PROHIBIDO terminar tu respuesta anunciando que "vas a consultar" algo — consúltalo ahora y responde con el resultado
- Si el cliente saluda (hola, buenas, etc.) sin pedir nada más: responde el saludo brevemente y pregunta en qué puedes ayudarle, mencionando 2-3 temas que puedes resolver (deuda, soporte, planes, instalación)
- PROHIBIDO INVENTAR: nunca generes pasos de soporte técnico, procesos, precios, políticas ni procedimientos que no estén en tus herramientas o documentos. Si no tienes la información real, escala al agente humano.
- Si el cliente pregunta por qué el monto de una factura es distinto a otro mes (ej. "por qué mi factura de mayo es mayor"), SIEMPRE llama explain_invoice_difference — PROHIBIDO calcular o inventar la razón vos mismo (impuestos, moras, recargos u otras causas) sin llamar a esta herramienta primero.`;
  }

  /** Fecha/hora actual en zona horaria de Bolivia, legible para el modelo. */
  private currentDateLine(): string {
    const now = new Date();
    const fecha = new Intl.DateTimeFormat('es-BO', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'America/La_Paz',
    }).format(now);
    const iso = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/La_Paz',
    }).format(now);
    const hora = new Intl.DateTimeFormat('es-BO', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/La_Paz',
    }).format(now);
    return `${fecha} (${iso}), ${hora} hora de Bolivia`;
  }
}
