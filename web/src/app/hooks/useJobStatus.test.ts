import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useJobStatus } from "./useJobStatus";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 404 ? "Not Found" : "OK",
    json: async () => body,
  } as unknown as Response;
}

const processing = { jobId: "job-1", status: "PROCESSING", phase: "EXTRACTING_CONTENT", progressPercent: 25 };
const done = { jobId: "job-1", status: "DONE", phase: "COMPLETED", progressPercent: 100 };

describe("useJobStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does nothing without a job id", () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    const { result } = renderHook(() => useJobStatus(null));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.job).toBeNull();
  });

  it("polls until the job reaches a final status", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(processing))
      .mockResolvedValueOnce(jsonResponse(done));
    globalThis.fetch = fetchMock;

    const { result } = renderHook(() => useJobStatus("job-1", 1000));

    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/jobs/job-1", expect.anything());
    expect(result.current.job?.status).toBe("PROCESSING");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.job?.status).toBe("DONE");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps polling after a transient error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse(processing));
    globalThis.fetch = fetchMock;

    const { result } = renderHook(() => useJobStatus("job-1", 1000));

    await act(async () => {});
    expect(result.current.error).toMatch(/500/);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.job?.status).toBe("PROCESSING");
  });

  it("stops polling and flags notFound on 404", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 404));
    globalThis.fetch = fetchMock;

    const { result } = renderHook(() => useJobStatus("job-1", 1000));

    await act(async () => {});
    expect(result.current.notFound).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops polling on unmount", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(processing));
    globalThis.fetch = fetchMock;

    const { unmount } = renderHook(() => useJobStatus("job-1", 1000));
    await act(async () => {});
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
