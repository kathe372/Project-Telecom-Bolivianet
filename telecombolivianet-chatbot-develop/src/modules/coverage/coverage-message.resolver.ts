import { Injectable } from '@nestjs/common';
import { CoverageBackendCheck } from './coverage.interfaces';

/**
 * BUG-10: traduce el resultado del backend a un mensaje preciso.
 * Antes todo caso ESCALATE decía "tu zona no está registrada", aunque la zona
 * existiera y el problema fuera capacidad de cajas NAP o expansión en curso.
 */
@Injectable()
export class CoverageMessageResolver {

  confirmed(lat: number, lng: number): string {
    return `¡Tenemos cobertura de fibra óptica en tu zona! (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
  }

  noCoverage(): string {
    return 'Por el momento no tenemos cobertura en tu zona. Te avisaremos cuando expandamos la red.';
  }

  escalate(check: CoverageBackendCheck): string {
    const zona = check.zoneName ? ` (${check.zoneName})` : '';
    switch (check.escalationReason) {
      // PASO 11: punto fuera de zona pero cerca del borde (≤200m, configurable
      // por SystemConfig) — no promete cobertura confirmada, pero tampoco
      // cierra la puerta como NO_COVERAGE.
      case 'NEAR_ZONE_BOUNDARY':
        return `Estás cerca de una zona con cobertura${zona}, pero no puedo confirmarla ` +
          `automáticamente. Un agente evaluará tu caso.`;
      case 'ZONE_IN_EXPANSION':
        return `Tu zona${zona} está en expansión de red. Un agente te confirmará cuándo podremos instalarte.`;
      case 'NO_CAPACITY':
        return `Hay cobertura en tu zona${zona}, pero por ahora no tenemos un punto de conexión con capacidad ` +
          `cerca de tu domicilio. Un técnico evaluará tu caso para confirmar la instalación.`;
      case 'NO_BOXES_REGISTERED':
        return `Hay cobertura en tu zona${zona}, pero necesitamos una verificación técnica en tu dirección. ` +
          `Un agente coordinará la evaluación.`;
      default:
        return 'Tu ubicación requiere verificación manual de cobertura. Un agente revisará la disponibilidad.';
    }
  }

  unreachable(): string {
    return 'No pudimos verificar la cobertura en este momento. Un agente te ayudará.';
  }
}
