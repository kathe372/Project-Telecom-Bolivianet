import { Injectable } from '@nestjs/common';

export type PlanChangeEffectivity = 'inmediato' | 'fin_de_mes' | 'desconocido';

/**
 * BUG-5: regla de negocio de vigencia de cambio de plan.
 * Upgrade (precio destino > actual)  → se aplica de inmediato tras aprobación.
 * Downgrade (precio destino ≤ actual) → se aplica el 1ro del mes siguiente.
 * Sin precios comparables → mensaje neutro (no prometer plazos incorrectos).
 */
@Injectable()
export class PlanChangeEffectivityPolicy {

  resolve(currentPriceBs: number | null, targetPriceBs: number | null): PlanChangeEffectivity {
    if (currentPriceBs == null || targetPriceBs == null) return 'desconocido';
    return targetPriceBs > currentPriceBs ? 'inmediato' : 'fin_de_mes';
  }

  message(effectivity: PlanChangeEffectivity): string {
    switch (effectivity) {
      case 'inmediato':
        return 'Por ser un upgrade, el cambio se aplicará de inmediato una vez aprobado por administración.';
      case 'fin_de_mes':
        return 'El cambio se aplicará el 1ro del mes siguiente una vez aprobado por administración.';
      default:
        return 'El cambio quedará registrado y administración te confirmará la fecha de aplicación.';
    }
  }
}
