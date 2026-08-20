// ══════════════════════════════════════════════════════════════
// COVERAGE MODULE (Fase 3 — PLAN-COBERTURA-REAL)
//
// Providers expuestos:
//   NominatimService  — geocodificación via OpenStreetMap + caché Redis
//   CoverageService   — orquesta ubicación → consulta cobertura backend
//
// COVERAGE_REPOSITORY (ICoverageRepository) apunta a SistemaApiService
// y se registra en AppModule para que ambos compartan la misma instancia.
// ══════════════════════════════════════════════════════════════
import { Module } from '@nestjs/common';
import { NominatimService } from './nominatim.service';
import { CoverageService } from './coverage.service';
import { CoverageMessageResolver } from './coverage-message.resolver';

@Module({
  providers: [NominatimService, CoverageService, CoverageMessageResolver],
  exports:   [NominatimService, CoverageService, CoverageMessageResolver],
})
export class CoverageModule {}
