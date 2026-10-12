import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { getJobStatus, JobStatusError, JobStatusResponse } from "./pollingApi";

describe("pollingApi", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("JobStatusError", () => {
    it("carries the message, HTTP status and name", () => {
      const error = new JobStatusError("HTTP 404 - Not Found", 404);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(JobStatusError);
      expect(error.message).toBe("HTTP 404 - Not Found");
      expect(error.status).toBe(404);
      expect(error.name).toBe("JobStatusError");
    });
  });

  describe("getJobStatus", () => {
    const jobId = "123e4567-e89b-12d3-a456-426614174000";

    const mockJobResponse: JobStatusResponse = {
      jobId,
      status: "PROCESSING",
      sourceFilename: "document.pdf",
      pageCount: 3,
      createdAt: "2026-10-01T08:00:00Z",
      startedAt: "2026-10-01T08:00:02Z",
      completedAt: null,
      phase: "EXTRACTING_CONTENT",
      progressPercent: 42,
      durationSeconds: 5,
      estimatedRemainingSeconds: 7,
      estimatedTotalSeconds: 12,
      currentPhaseEstimatedRemainingSeconds: 3,
      output: null,
      metrics: null,
    };

    it("fetches job status and returns the parsed body", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockJobResponse,
      } as unknown as Response);

      const result = await getJobStatus(jobId);

      expect(result).toEqual(mockJobResponse);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("requests the job endpoint with no-store caching", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockJobResponse,
      } as unknown as Response);

      await getJobStatus(jobId);

      const [url, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe(`/api/v1/jobs/${jobId}`);
      expect(options.cache).toBe("no-store");
      expect(options.signal).toBeUndefined();
    });

    it("returns a completed job with output and metrics", async () => {
      const doneResponse: JobStatusResponse = {
        ...mockJobResponse,
        status: "DONE",
        phase: "COMPLETED",
        progressPercent: 100,
        completedAt: "2026-10-01T08:00:14Z",
        estimatedRemainingSeconds: 0,
        currentPhaseEstimatedRemainingSeconds: 0,
        output: {
          filename: "document.docx",
          sizeBytes: 20480,
          downloadUrl: `/api/v1/jobs/${jobId}/download`,
        },
        metrics: { sourceWordCount: 1200, outputWordCount: 1198 },
      };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => doneResponse,
      } as unknown as Response);

      const result = await getJobStatus(jobId);

      expect(result.status).toBe("DONE");
      expect(result.output?.filename).toBe("document.docx");
      expect(result.metrics?.outputWordCount).toBe(1198);
    });

    it("forwards the abort signal to fetch", async () => {
      const controller = new AbortController();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockJobResponse,
      } as unknown as Response);

      await getJobStatus(jobId, controller.signal);

      const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(options.signal).toBe(controller.signal);
    });

    it("rejects when the request is aborted", async () => {
      const controller = new AbortController();
      globalThis.fetch = vi.fn().mockImplementation((_, options) => {
        if (options?.signal?.aborted) {
          return Promise.reject(new DOMException("The user aborted a request.", "AbortError"));
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => mockJobResponse });
      });

      controller.abort();

      await expect(getJobStatus(jobId, controller.signal)).rejects.toMatchObject({
        name: "AbortError",
      });
    });

    it.each([
      [404, "Not Found"],
      [500, "Internal Server Error"],
      [502, "Bad Gateway"],
    ])("throws JobStatusError for HTTP %i", async (status, statusText) => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status,
        statusText,
        json: async () => ({}),
      } as unknown as Response);

      const promise = getJobStatus(jobId);

      await expect(promise).rejects.toBeInstanceOf(JobStatusError);
      await expect(promise).rejects.toMatchObject({
        status,
        message: `HTTP ${status} - ${statusText}`,
      });
    });

    it("does not parse the body when the response is not ok", async () => {
      const json = vi.fn();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        json,
      } as unknown as Response);

      await expect(getJobStatus(jobId)).rejects.toThrow(JobStatusError);
      expect(json).not.toHaveBeenCalled();
    });

    it("propagates network failures unchanged", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

      const promise = getJobStatus(jobId);

      await expect(promise).rejects.toThrow("Failed to fetch");
      await expect(promise).rejects.not.toBeInstanceOf(JobStatusError);
    });

    it("propagates JSON parse failures on a successful response", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
      } as unknown as Response);

      await expect(getJobStatus(jobId)).rejects.toThrow(SyntaxError);
    });
  });
});
