/**
 * PASO 6 (2026-08): antes cada entrada tenía además `slaHours`, mandado al
 * backend como SlaDurationHours y usado TAL CUAL (CreateTicketCommand.cs:82-84
 * lo prioriza sobre el cálculo real) — el chatbot tenía su propia copia de las
 * horas de SLA que pisaba en silencio lo que el admin configura en
 * SlaPlansPanel.tsx (SlaPlan por Priority). Se eliminó `slaHours`: el backend
 * SIEMPRE calcula el SLA real a partir de `priority` (GetDueDateFromSlaAsync).
 *
 * PASO 16 Fase A (2026-08): extraído de create-support-ticket.tool.ts a un
 * lugar compartido — check-recurring-issue.tool.ts necesita el mismo mapeo
 * issue_type→Type para contar tickets del mismo tipo de problema. Antes de
 * este cambio, duplicarlo en el segundo tool hubiera sido otra copia de la
 * misma fuente de verdad (mismo patrón que ya se evitó varias veces en esta
 * auditoría: deuda, precios, número de ticket, horarios, SLA).
 */
export const ISSUE_TYPE_MAP: Record<string, { type: string; priority: string }> = {
  sin_conexion:           { type: 'SoporteTecnico',       priority: 'Alta'  },
  velocidad_lenta:        { type: 'SoporteTecnico',       priority: 'Media' },
  problema_router:        { type: 'SoporteTecnico',       priority: 'Media' },
  cable_cortado:          { type: 'SoporteTecnico',       priority: 'Alta'  },
  sin_senal_tv:           { type: 'TvCable',              priority: 'Media' },
  problema_decoder:       { type: 'TvCable',              priority: 'Baja'  },
  solicitar_reactivacion: { type: 'ReactivacionServicio', priority: 'Alta'  },
};
