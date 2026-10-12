import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useJobPolling } from "./useJobPolling";
import * as jobApi from "./jobApi";

describe("useJobPolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not poll when enabled is false or jobId is null", () => {
    const getJobStatusSpy = vi.spyOn(jobApi, "getJobStatus");

    renderHook(() =>
      useJobPolling({
        jobId: null,
        enabled: false,
      })
    );

    expect(getJobStatusSpy).not.toHaveBeenCalled();
  });

  it("polls and fires onStatusChange and onComplete when status is DONE", async () => {
    const onStatusChange = vi.fn();
    const onComplete = vi.fn();
    const onFailed = vi.fn();

    const getJobStatusSpy = vi.spyOn(jobApi, "getJobStatus")
      .mockResolvedValueOnce({
        jobId: "test-uuid",
        status: "PROCESSING",
        sourceFilename: "test.pdf",
        pageCount: 2,
        createdAt: "2026-10-01T08:00:00Z",
      })
      .mockResolvedValueOnce({
        jobId: "test-uuid",
        status: "DONE",
        sourceFilename: "test.pdf",
        pageCount: 2,
        createdAt: "2026-10-01T08:00:00Z",
      });

    renderHook(() =>
      useJobPolling({
        jobId: "test-uuid",
        intervalMs: 1000,
        onStatusChange,
        onComplete,
        onFailed,
      })
    );

    // Initial poll
    await act(async () => {
      await Promise.resolve();
    });

    expect(getJobStatusSpy).toHaveBeenCalledTimes(1);
    expect(onStatusChange).toHaveBeenCalledWith("PROCESSING", expect.objectContaining({ status: "PROCESSING" }));
    expect(onComplete).not.toHaveBeenCalled();

    // Advance timer for next interval
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(getJobStatusSpy).toHaveBeenCalledTimes(2);
    expect(onStatusChange).toHaveBeenCalledWith("DONE", expect.objectContaining({ status: "DONE" }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onFailed).not.toHaveBeenCalled();

    // Advancing further should not trigger additional polls because it completed
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(getJobStatusSpy).toHaveBeenCalledTimes(2);
  });

  it("fires onFailed and stops polling when status is FAILED", async () => {
    const onStatusChange = vi.fn();
    const onFailed = vi.fn();

    vi.spyOn(jobApi, "getJobStatus").mockResolvedValueOnce({
      jobId: "test-uuid",
      status: "FAILED",
      sourceFilename: "test.pdf",
      pageCount: 2,
      createdAt: "2026-10-01T08:00:00Z",
    });

    renderHook(() =>
      useJobPolling({
        jobId: "test-uuid",
        onStatusChange,
        onFailed,
      })
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(onStatusChange).toHaveBeenCalledWith("FAILED", expect.objectContaining({ status: "FAILED" }));
    expect(onFailed).toHaveBeenCalledTimes(1);
  });

  it("retries on error and triggers onFailed after maxConsecutiveErrors", async () => {
    const onError = vi.fn();
    const onFailed = vi.fn();

    vi.spyOn(jobApi, "getJobStatus").mockRejectedValue(new Error("Network Error"));

    renderHook(() =>
      useJobPolling({
        jobId: "test-uuid",
        intervalMs: 1000,
        maxConsecutiveErrors: 3,
        onError,
        onFailed,
      })
    );

    // Attempt 1
    await act(async () => {
      await Promise.resolve();
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onFailed).not.toHaveBeenCalled();

    // Attempt 2
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onFailed).not.toHaveBeenCalled();

    // Attempt 3 (reaches maxConsecutiveErrors)
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    expect(onError).toHaveBeenCalledTimes(3);
    expect(onFailed).toHaveBeenCalledTimes(1);
    expect(onFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("3 consecutive attempts"),
      })
    );
  });
});