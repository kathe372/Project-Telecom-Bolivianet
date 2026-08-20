export function useGeolocation(timeoutMs = 10_000): Promise<GeolocationPosition> {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalización no disponible en este navegador'));
      return;
    }

    const timeoutId = setTimeout(
      () => reject(new Error('Tiempo de espera de geolocalización agotado')),
      timeoutMs,
    );

    navigator.geolocation.getCurrentPosition(
      (pos) => { clearTimeout(timeoutId); resolve(pos); },
      (err) => { clearTimeout(timeoutId); reject(err); },
      { timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}
