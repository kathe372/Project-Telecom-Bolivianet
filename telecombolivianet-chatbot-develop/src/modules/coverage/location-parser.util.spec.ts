import { parseGoogleMapsUrl, extractCoordsFromText, extractGoogleMapsShortLink } from './location-parser.util';

describe('parseGoogleMapsUrl', () => {
  it('TC-LP01 — extrae coords de ?q=lat,lng', () => {
    const result = parseGoogleMapsUrl('https://www.google.com/maps?q=-17.389,-66.156');
    expect(result).toEqual({ lat: -17.389, lng: -66.156 });
  });

  it('TC-LP02 — extrae coords de @lat,lng,zoom', () => {
    const result = parseGoogleMapsUrl('https://www.google.com/maps/@-17.3895,-66.1565,15z');
    expect(result).toEqual({ lat: -17.3895, lng: -66.1565 });
  });

  it('TC-LP03 — retorna null para goo.gl (redirect asíncrono)', () => {
    expect(parseGoogleMapsUrl('https://goo.gl/maps/abc123')).toBeNull();
  });

  it('TC-LP04 — retorna null para maps.app.goo.gl', () => {
    expect(parseGoogleMapsUrl('https://maps.app.goo.gl/xyz456')).toBeNull();
  });

  it('TC-LP05 — retorna null para texto sin URL de mapa', () => {
    expect(parseGoogleMapsUrl('vivo en la zona norte de Cochabamba')).toBeNull();
  });

  it('TC-LP06 — extrae coords de URL con ruta /place/@lat,lng,zoom', () => {
    const result = parseGoogleMapsUrl(
      'https://www.google.com/maps/place/Cochabamba/@-17.3895,-66.1565,14z/data=!4m5',
    );
    expect(result).toEqual({ lat: -17.3895, lng: -66.1565 });
  });

  it('TC-LP07 — retorna null para string vacío', () => {
    expect(parseGoogleMapsUrl('')).toBeNull();
  });

  it('TC-LP13 — prioriza data=!3d!4d (pin exacto) sobre @lat,lng,zoom (centro de viewport)', () => {
    // Caso real: un link "place" resuelto de goo.gl trae un @ que es solo el
    // centro del mapa (puede estar a ~250m del pin) y el dato preciso en !3d!4d.
    const result = parseGoogleMapsUrl(
      "https://www.google.com/maps/place/17°25'55.1\"S+66°08'07.9\"W/@-17.4319759,-66.1380879,17z/data=!3m1!4b1!4m4!3m3!8m2!3d-17.431981!4d-66.135513",
    );
    expect(result).toEqual({ lat: -17.431981, lng: -66.135513 });
  });
});

describe('extractGoogleMapsShortLink', () => {
  it('TC-LP14 — extrae un link maps.app.goo.gl de texto libre', () => {
    expect(extractGoogleMapsShortLink('mira mi ubicación https://maps.app.goo.gl/fezWs9uNQLWRh8oLA')).toBe(
      'https://maps.app.goo.gl/fezWs9uNQLWRh8oLA',
    );
  });

  it('TC-LP15 — extrae un link goo.gl/maps de texto libre', () => {
    expect(extractGoogleMapsShortLink('https://goo.gl/maps/abc123')).toBe('https://goo.gl/maps/abc123');
  });

  it('TC-LP16 — retorna null si no hay link corto', () => {
    expect(extractGoogleMapsShortLink('vivo en la zona norte')).toBeNull();
    expect(extractGoogleMapsShortLink('https://www.google.com/maps?q=-17.389,-66.156')).toBeNull();
  });
});

describe('extractCoordsFromText', () => {
  it('TC-LP08 — extrae coords de texto libre con coma', () => {
    const result = extractCoordsFromText('mi ubicación: -17.389123, -66.156456');
    expect(result).toEqual({ lat: -17.389123, lng: -66.156456 });
  });

  it('TC-LP09 — extrae coords sin espacio tras la coma', () => {
    const result = extractCoordsFromText('-17.389,-66.156');
    expect(result).toEqual({ lat: -17.389, lng: -66.156 });
  });

  it('TC-LP10 — retorna null si no hay coordenadas en el texto', () => {
    expect(extractCoordsFromText('vivo en la zona norte')).toBeNull();
  });

  it('TC-LP11 — retorna null para texto vacío', () => {
    expect(extractCoordsFromText('')).toBeNull();
  });

  it('TC-LP12 — retorna null si los decimales son insuficientes (falso positivo)', () => {
    // 71435981 style numbers should not match
    expect(extractCoordsFromText('llama al 71435981, local 12')).toBeNull();
  });
});
