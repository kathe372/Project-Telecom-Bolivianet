export interface ParsedCoords {
  lat: number;
  lng: number;
}

/**
 * Extract coordinates from Google Maps URLs.
 * Supports:
 *   https://www.google.com/maps?q=-17.389,-66.156
 *   https://www.google.com/maps/@-17.389,-66.156,15z
 *   https://www.google.com/maps/place/.../@-17.389,-66.156,15z
 *   https://www.google.com/maps/place/.../data=!3d-17.389!4d-66.156 (pin exacto)
 * Returns null for goo.gl / maps.app.goo.gl short links — esos no traen
 * coordenadas en el texto, hay que resolver el redirect primero con
 * GoogleMapsLinkResolverService.resolveShortLink() y volver a llamar a esta
 * función con la URL larga que devuelve.
 */
export function parseGoogleMapsUrl(text: string): ParsedCoords | null {
  if (!text) return null;
  if (/goo\.gl/i.test(text)) return null;

  // ?q=lat,lng  (also handles ?ll= and ?place=)
  const qMatch = text.match(/[?&](?:q|ll|place)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (qMatch) {
    const lat = parseFloat(qMatch[1]);
    const lng = parseFloat(qMatch[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }

  // data=...!3d{lat}!4d{lng} -> coordenada exacta del pin. Se revisa ANTES
  // que @lat,lng,zoom porque en URLs de tipo "place" el @ es solo el centro
  // del viewport (puede estar a cientos de metros del pin real).
  const pinMatch = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (pinMatch) {
    const lat = parseFloat(pinMatch[1]);
    const lng = parseFloat(pinMatch[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }

  // @lat,lng,zoom  (handles zoom suffixes like 15z or 14z)
  const atMatch = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),\d+[a-z]?/i);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lng = parseFloat(atMatch[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }

  return null;
}

const SHORT_LINK_REGEX = /https?:\/\/(?:maps\.app\.)?goo\.gl\/\S+/i;

/** Extrae el link corto de Google Maps (goo.gl / maps.app.goo.gl) de un texto libre, si hay uno. */
export function extractGoogleMapsShortLink(text: string): string | null {
  if (!text) return null;
  const match = text.match(SHORT_LINK_REGEX);
  return match ? match[0] : null;
}

/**
 * Extract raw decimal coordinates from free text.
 * Requires at least 3 decimal places to avoid false positives on phone numbers.
 * Example: "mi ubicación: -17.389123, -66.156456"
 */
export function extractCoordsFromText(text: string): ParsedCoords | null {
  if (!text) return null;
  const match = text.match(/(-?\d+\.\d{3,})\s*,\s*(-?\d+\.\d{3,})/);
  if (!match) return null;
  const lat = parseFloat(match[1]);
  const lng = parseFloat(match[2]);
  if (!isValidLatLng(lat, lng)) return null;
  return { lat, lng };
}

function isValidLatLng(lat: number, lng: number): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/**
 * BUG-04: ventana de frescura de la ubicación de sesión. Una conversación de
 * contratación (compartir ubicación → ver planes → dar datos → agendar) dura
 * más de 5 minutos, así que la ventana anterior de 5 min rompía el onboarding.
 * Fuente ÚNICA de verdad: la usan tanto el CoverageService (para decidir si
 * la ubicación sirve) como el prompt (para no afirmar una ubicación caducada).
 */
export const LOCATION_FRESHNESS_MS = 30 * 60 * 1000; // 30 minutos

export function isLocationFresh(capturedAt?: number | null): boolean {
  return !!capturedAt && (Date.now() - capturedAt) <= LOCATION_FRESHNESS_MS;
}
