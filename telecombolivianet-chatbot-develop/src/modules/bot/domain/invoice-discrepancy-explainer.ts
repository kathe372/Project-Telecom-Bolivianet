import { Injectable } from '@nestjs/common';

/**
 * PASO 5 (2026-08): el bot alucinó una vez una explicación de "IVA del 13%"
 * que no existe en ningún cálculo real de facturación — verificado que no
 * hay ningún impuesto ni recargo por mora en `BillingService`. Esta clase es
 * el guardia real (no solo una instrucción de prompt) contra esa alucinación:
 * solo puede afirmar una causa si hay una señal groundeada en los datos.
 */
export interface InvoiceForComparison {
  /** Texto legible del período, ej. "Mayo 2026" — solo para el mensaje. */
  period: string;
  amount: number;
  notes?: string | null;
  /** Snapshot del plan vigente EN ESA factura, no el plan actual del cliente. */
  planName?: string | null;
}

export interface DiscrepancyExplanation {
  hasExplanation: boolean;
  message: string;
}

@Injectable()
export class InvoiceDiscrepancyExplainer {
  explain(baseline: InvoiceForComparison, target: InvoiceForComparison): DiscrepancyExplanation {
    if (Math.abs(baseline.amount - target.amount) < 0.01) {
      return { hasExplanation: true, message: `${target.period} y ${baseline.period} tienen el mismo importe.` };
    }

    // Señal 1, la más común en la práctica: cambio de plan entre un mes y otro.
    if (baseline.planName && target.planName && baseline.planName !== target.planName) {
      return {
        hasExplanation: true,
        message:
          `${target.period}: tu plan era "${target.planName}" (en ${baseline.period} era ` +
          `"${baseline.planName}"). El cambio de plan explica la diferencia.`,
      };
    }

    // Señal 2: motivo explícito registrado en la factura (prorrateo, ajuste manual).
    if (target.notes?.trim()) {
      return { hasExplanation: true, message: `${target.period}: ${target.notes.trim()}` };
    }

    // Ninguna señal real disponible — NUNCA inventar una razón. Este es el
    // guardia real, no solo una instrucción de prompt.
    return {
      hasExplanation: false,
      message:
        `No encuentro un motivo registrado para la diferencia entre ${baseline.period} y ` +
        `${target.period}. Un agente lo revisará.`,
    };
  }
}
