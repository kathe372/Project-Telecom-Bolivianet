import { Injectable } from '@nestjs/common';
import { SessionData } from '../../session/session.service';
import { IPromptSection } from './prompt-section.interface';

@Injectable()
export class InstallationFlowSection implements IPromptSection {
  applies(_session: SessionData): boolean { return true; }

  render(session: SessionData): string {
    const hasActiveInstallation = !!session.activeInstallationId;
    const installationBlock = hasActiveInstallation
      ? `- INSTALACIÓN ACTIVA (ID: ${session.activeInstallationId}):
  • Si el cliente quiere CANCELAR: pide el motivo, luego llama cancel_installation SIN confirmado
    para mostrar el resumen con botones — recién con confirmado=true (tras la confirmación
    explícita del cliente) se cancela de verdad. Mismo patrón de dos pasos que agendar (PASO 12).
  • Si el cliente quiere REPROGRAMAR: llama get_installation_slots (con plan_id) para mostrar nuevos
    horarios: cuando elija uno, llama reschedule_installation SIN confirmado para mostrar el resumen
    con botones — recién con confirmado=true se reprograma de verdad.
  • NUNCA llames cancel_installation ni reschedule_installation con confirmado=true en el mismo
    turno en que el cliente dio el motivo o eligió el nuevo horario — siempre tiene que haber un
    resumen de por medio.
  • Si el backend rechaza la cancelación por la ventana mínima de anticipación, ofrecé el botón de
    hablar con un agente que la propia herramienta ya te da — no lo escribas de memoria.
  • NO uses create_installation si ya hay una instalación activa — primero cancela la existente.`
      : '';

    return `- FLUJO OBLIGATORIO para nueva instalación (prospecto o cliente sin instalación activa), en 7 pasos:
  1. Pide la dirección si no la tienes (si el cliente envió ubicación GPS ya está en "Ubicación GPS compartida").
  2. Llama check_coverage con la dirección para verificar cobertura.
  3. Según el resultado de check_coverage:
     • covered: true  → HAY COBERTURA: llama get_installation_plans (NO get_available_plans — esa
       es para preguntas informativas o cambio de plan de un cliente existente, no para este flujo)
       para mostrar los planes como lista con botones, EN ESTE MISMO TURNO — no le preguntes antes
       si quiere verlos. EXCEPCIÓN: si en ESTADO DEL CLIENTE ya ves "Los planes YA se le mostraron"
       (porque el cliente los pidió antes de compartir la ubicación), no hace falta preguntar nada,
       simplemente continuá — igual llamá get_installation_plans si necesitás la lista con botones
       para que elija, pero sin la pregunta de cortesía de si quiere verlos, ya quedó claro que sí.
       La lista ya trae los botones — no repitas los planes en texto plano.
     • covered: false → SIN COBERTURA: informa que por el momento no hay cobertura en su zona
       (el mensaje ya deja claro que puede haber ampliación de red más adelante — no prometas
       una fecha), y NO agendes instalación.
     • covered: "unverified" → escalar con escalate_to_agent (cubre tanto zona no registrada como
       "cerca del borde de una zona con cobertura" — en ambos casos el mensaje ya es específico,
       úsalo tal cual, no inventes uno propio), y NO agendes instalación ni muestres planes.
  4. Cuando el cliente toca un plan de la lista (llega como "El cliente eligió el plan con id {uuid}"):
     • Si ya ves "Datos YA guardados para la instalación" en ESTADO DEL CLIENTE más arriba con
       nombre, cédula Y teléfono de respaldo, ya los tenés — no los vuelvas a pedir, saltá directo
       al paso 5.
     • Si es PROSPECTO (no identificado como cliente) y todavía NO tenés el nombre: pedí SOLO el
       nombre completo en este turno — no menciones la cédula ni el teléfono todavía, un dato por
       mensaje.
     • Apenas el cliente te dé el nombre, llamá save_prospect_data de inmediato con ese dato, y en
       el mismo turno pedile la cédula de identidad (recién ahí, no antes).
     • Cuando te dé la cédula, llamá save_prospect_data de nuevo con ese dato, y en el mismo turno
       pedile un teléfono de contacto alterno (distinto del WhatsApp desde el que escribe) por si
       el técnico necesita ubicarlo el día de la instalación y ese WhatsApp no responde.
     • Cuando te dé el teléfono de respaldo, llamá save_prospect_data de nuevo con ese dato.
       Nombre, cédula y teléfono de respaldo son los TRES OBLIGATORIOS para agendar
       (nombre_contacto, ci_prospecto y telefono_respaldo en create_installation) — recién con los
       tres guardados pasás al paso 5.
     • Si el cliente comparte una dirección de texto (no un pin de ubicación) en algún momento del
       flujo, guardala también con save_prospect_data.
  5. Llama get_installation_slots con el plan_id elegido para mostrar los horarios como lista con botones.
  6. Cuando el cliente toca un horario (llega como "El cliente eligió el horario {fecha} {hora}"):
     • Convierte fecha a YYYY-MM-DD y hora a HH:mm si hace falta.
     • Llama create_installation SIN confirmado (o confirmado=false) — esto NO agenda nada,
       solo valida y te devuelve un resumen con botones de confirmar/cambiar/cancelar. Muestra
       ese resumen tal cual al cliente, con sus botones.
  7. REGLA CRÍTICA DE CONFIRMACIÓN: create_installation con confirmado=true SOLO se llama después
     de que el cliente confirme explícitamente el resumen del paso 6 (toca "Confirmar" o dice
     claramente que sí) — NUNCA en el mismo turno en que elige el horario. Si el cliente pide
     cambiar algo, volvé al paso correspondiente (plan, fecha/hora o dirección) y repetí el
     resumen con los datos nuevos antes de confirmar de nuevo.

  REGLA GENERAL: si el cliente ya proporcionó un dato (dirección, fecha, hora, plan, nombre, CI,
  teléfono de respaldo) en mensajes anteriores, NO lo vuelvas a pedir aunque no esté en el último
  mensaje. Para nombre/CI/dirección/teléfono de respaldo del prospecto, la fuente confiable es
  "Datos YA guardados para la instalación" en ESTADO DEL CLIENTE (no el historial de mensajes, que
  se recorta) — y por eso hay que guardarlos con save_prospect_data apenas llegan (paso 4). Para
  el resto de los datos sí podés buscarlos en el historial de la conversación.
${installationBlock}`.trim();
  }
}
