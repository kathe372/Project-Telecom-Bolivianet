// ─── Injection token (DIP) ────────────────────────────────────
export const COVERAGE_REPOSITORY = Symbol('COVERAGE_REPOSITORY');

// ─── Repository interface — thin boundary to the backend API ─

/** Motivos de escalación que reporta el backend (CoverageQueryService C#). */
export type CoverageEscalationReason =
  | 'ZONE_IN_EXPANSION'
  | 'NO_CAPACITY'
  | 'NO_BOXES_REGISTERED'
  // PASO 11 (2026-08): punto fuera de cualquier zona, pero a ≤200m del borde
  // de la más cercana — antes cualquier punto fuera de zona (5m o 50km) caía
  // igual en NO_COVERAGE, sin distinción.
  | 'NEAR_ZONE_BOUNDARY'
  | string;

export interface CoverageBackendCheck {
  /** true: cobertura confirmada · false: sin zona · null: zona sin capacidad/verificación manual */
  covered: boolean | null;
  zoneName?: string | null;
  escalationReason?: CoverageEscalationReason | null;
}

export interface ICoverageRepository {
  checkCoverage(lat: number, lng: number): Promise<CoverageBackendCheck>;
}

// ─── Input discriminated union ────────────────────────────────
export type LocationInput =
  | { type: 'gps';             lat: number; lng: number }
  | { type: 'text';            text: string }
  | { type: 'google_maps_url'; url: string };

// ─── Result types ─────────────────────────────────────────────
export type CoverageCheckOutcome = 'CONFIRMED' | 'NO_COVERAGE' | 'ESCALATE' | 'NO_COORDS';

export interface CoverageCheckResult {
  outcome: CoverageCheckOutcome;
  lat?: number;
  lng?: number;
  message: string;
}
