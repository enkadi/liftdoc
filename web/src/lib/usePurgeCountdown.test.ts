import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { PURGE_TTL_SECONDS, usePurgeCountdown } from "./usePurgeCountdown";

const START = new Date("2026-01-01T00:00:00Z").getTime();

describe("usePurgeCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null when completedAt is undefined", () => {
    const { result } = renderHook(() => usePurgeCountdown(undefined));
    expect(result.current).toBeNull();
  });

  it("does not start a timer when completedAt is undefined", () => {
    renderHook(() => usePurgeCountdown(undefined));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns the full TTL right after completion", () => {
    const { result } = renderHook(() => usePurgeCountdown(START));
    expect(result.current).toBe(PURGE_TTL_SECONDS);
  });

  it("counts down once per second", () => {
    const { result } = renderHook(() => usePurgeCountdown(START));

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(PURGE_TTL_SECONDS - 1);

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(result.current).toBe(PURGE_TTL_SECONDS - 5);
  });

  it("accounts for time already elapsed since completion", () => {
    const completedAt = START - 10 * 60 * 1000;
    const { result } = renderHook(() => usePurgeCountdown(completedAt));
    expect(result.current).toBe(PURGE_TTL_SECONDS - 10 * 60);
  });

  it("respects a custom ttlSeconds", () => {
    const { result } = renderHook(() => usePurgeCountdown(START, 30));
    expect(result.current).toBe(30);

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current).toBe(20);
  });

  it("never goes below zero once the TTL has passed", () => {
    const { result } = renderHook(() => usePurgeCountdown(START, 5));

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe(0);
  });

  it("does not exceed the TTL when completedAt is later than the stale clock", () => {
    const { result, rerender } = renderHook(
      ({ completedAt }: { completedAt?: number }) => usePurgeCountdown(completedAt),
      { initialProps: {} as { completedAt?: number } },
    );

    // Real time moves on while no timer is running, so the hook's `now` is stale.
    vi.setSystemTime(START + 30_000);
    rerender({ completedAt: START + 30_000 });
    expect(result.current).toBe(PURGE_TTL_SECONDS);

    // The immediate tick refreshes `now` without waiting a full second.
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current).toBe(PURGE_TTL_SECONDS);
  });

  it("restarts the countdown when completedAt changes", () => {
    const { result, rerender } = renderHook(
      ({ completedAt }) => usePurgeCountdown(completedAt),
      { initialProps: { completedAt: START } },
    );

    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(result.current).toBe(PURGE_TTL_SECONDS - 20);

    rerender({ completedAt: START + 20_000 });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current).toBe(PURGE_TTL_SECONDS);
  });

  it("clears its timers on unmount", () => {
    const { unmount } = renderHook(() => usePurgeCountdown(START));
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
