import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSmoothedProgress } from "./useSmoothedProgress";

describe("useSmoothedProgress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at the target", () => {
    const { result } = renderHook(() => useSmoothedProgress(25, 54));
    expect(result.current).toBe(25);
  });

  it("creeps towards the ceiling without reaching it", () => {
    const { result } = renderHook(() => useSmoothedProgress(25, 54));

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    const midway = result.current;
    expect(midway).toBeGreaterThan(25);
    expect(midway).toBeLessThan(54);

    act(() => {
      vi.advanceTimersByTime(600_000);
    });
    expect(result.current).toBeGreaterThanOrEqual(midway);
    expect(result.current).toBeLessThan(54);
  });

  it("does not move when the ceiling equals the target", () => {
    const { result } = renderHook(() => useSmoothedProgress(0, 0));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(0);
  });

  it("jumps to a new target and never goes backwards", () => {
    const { result, rerender } = renderHook(
      ({ target, ceiling }) => useSmoothedProgress(target, ceiling),
      { initialProps: { target: 25, ceiling: 54 } },
    );
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    const crept = result.current;

    rerender({ target: 55, ceiling: 74 });
    expect(result.current).toBe(55);

    rerender({ target: 100, ceiling: 100 });
    expect(result.current).toBe(100);
    expect(result.current).toBeGreaterThan(crept);
  });
});
