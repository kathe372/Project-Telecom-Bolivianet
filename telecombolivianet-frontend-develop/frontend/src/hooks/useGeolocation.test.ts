import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useGeolocation } from './useGeolocation';

describe('useGeolocation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: vi.fn() },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects after the timeout when getCurrentPosition never calls back', async () => {
    vi.spyOn(navigator.geolocation, 'getCurrentPosition').mockImplementation(() => {
    });

    const promise = useGeolocation(100);
    vi.advanceTimersByTime(150);

    await expect(promise).rejects.toThrow('agotado');
  });

  it('resolves with position when browser responds in time', async () => {
    const fakePosition = { coords: { latitude: -16.5, longitude: -68.15 } } as GeolocationPosition;

    vi.spyOn(navigator.geolocation, 'getCurrentPosition').mockImplementation(
      (success) => { success(fakePosition); },
    );

    const result = await useGeolocation(5_000);
    expect(result).toBe(fakePosition);
  });

  it('rejects with the GeolocationPositionError when denied', async () => {
    const fakeError = { code: 1, message: 'Permission denied' } as GeolocationPositionError;

    vi.spyOn(navigator.geolocation, 'getCurrentPosition').mockImplementation(
      (_success, error) => { error!(fakeError); },
    );

    await expect(useGeolocation(5_000)).rejects.toBe(fakeError);
  });
});
