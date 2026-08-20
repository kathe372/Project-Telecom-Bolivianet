import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePolling } from './usePolling';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe('usePolling', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not call fn after unmount', async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockResolvedValue(undefined);

    const { unmount } = renderHook(() => usePolling(fn, 100));

    await vi.advanceTimersByTimeAsync(150);
    const countBeforeUnmount = fn.mock.calls.length;

    unmount();
    await vi.advanceTimersByTimeAsync(500);

    expect(fn.mock.calls.length).toBe(countBeforeUnmount);
  });

  it('calls fn at each interval', async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockResolvedValue(undefined);

    renderHook(() => usePolling(fn, 100));
    await vi.advanceTimersByTimeAsync(350);

    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
