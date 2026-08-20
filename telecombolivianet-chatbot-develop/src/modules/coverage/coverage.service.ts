import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SessionData } from '../session/session.service';
import { NominatimService } from './nominatim.service';
import { CoverageMessageResolver } from './coverage-message.resolver';
import {
  COVERAGE_REPOSITORY, ICoverageRepository,
  LocationInput, CoverageCheckResult,
} from './coverage.interfaces';
import {
  parseGoogleMapsUrl, extractCoordsFromText, ParsedCoords, isLocationFresh,
} from './location-parser.util';

@Injectable()
export class CoverageService {
  private readonly logger = new Logger(CoverageService.name);

  constructor(
    @Inject(COVERAGE_REPOSITORY) private readonly repo: ICoverageRepository,
    private readonly nominatim: NominatimService,
    private readonly messages:  CoverageMessageResolver,
  ) {}

  async check(input: LocationInput, session: SessionData): Promise<CoverageCheckResult> {
    // Priority 1: recent GPS from session (WhatsApp share or previous URL), max 5 min old
    const recentCoords = this.getRecentSessionLocation(session);
    if (recentCoords) {
      return this.query(recentCoords.lat, recentCoords.lng);
    }

    // Priority 2: resolve from input
    const coords = await this.resolveCoords(input);
    if (!coords) {
      return {
        outcome: 'NO_COORDS',
        message:
          'No pude determinar tu ubicación. Por favor comparte tu ubicación GPS ' +
          'o un enlace de Google Maps.',
      };
    }

    return this.query(coords.lat, coords.lng);
  }

  private getRecentSessionLocation(session: SessionData): ParsedCoords | null {
    // BUG-04: frescura unificada (ver location-parser.util). Un onboarding dura
    // más de 5 min; la ventana ahora es de 30 min y es la misma que usa el prompt.
    if (!session.lastLocation || !isLocationFresh(session.locationCapturedAt)) return null;
    return { lat: session.lastLocation.lat, lng: session.lastLocation.lng };
  }

  private async resolveCoords(input: LocationInput): Promise<ParsedCoords | null> {
    if (input.type === 'gps') return { lat: input.lat, lng: input.lng };
    if (input.type === 'google_maps_url') return parseGoogleMapsUrl(input.url);
    // text: try raw coords first, fall back to geocoding
    return extractCoordsFromText(input.text) ?? await this.nominatim.geocode(input.text);
  }

  private async query(lat: number, lng: number): Promise<CoverageCheckResult> {
    try {
      const check = await this.repo.checkCoverage(lat, lng);

      if (check.covered === true) {
        return { outcome: 'CONFIRMED', lat, lng, message: this.messages.confirmed(lat, lng) };
      }

      if (check.covered === false) {
        return { outcome: 'NO_COVERAGE', lat, lng, message: this.messages.noCoverage() };
      }

      // covered null → zona sin capacidad, en expansión o sin verificar (BUG-10: mensaje según motivo)
      return { outcome: 'ESCALATE', lat, lng, message: this.messages.escalate(check) };
    } catch (err: any) {
      this.logger.error(`CoverageService.query error: ${err.message}`);
      return { outcome: 'ESCALATE', message: this.messages.unreachable() };
    }
  }
}
