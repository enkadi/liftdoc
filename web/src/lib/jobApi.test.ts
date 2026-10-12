import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { getJobStatus, JobStatusResponse } from "./jobApi";

describe("jobApi", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("getJobStatus", () => {
    const mockJobResponse: JobStatusResponse = {
      jobId: "123e4567-e89b-12d3-a456-426614174000",
      status: "PROCESSING",
      sourceFilename: "document.pdf",
      pageCount: 3,
      createdAt: "2026-10-01T08:00:00Z",
    };

    it("fetches job status successfully and returns data", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockJobResponse,
      } as unknown as Response);

      const result = await getJobStatus("123e4567-e89b-12d3-a456-426614174000");

      expect(result).toEqual(mockJobResponse);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe("/api/v1/jobs/123e4567-e89b-12d3-a456-426614174000");
      expect(options.method).toBe("GET");
    });

    it("handles 404 with custom backend error message", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({
          code: "JOB_NOT_FOUND",
          message: "No conversion job found with the given ID.",
        }),
      } as unknown as Response);

      await expect(getJobStatus("non-existent-id")).rejects.toThrow(
        "No conversion job found with the given ID."
      );
    });

    it("handles 404 with fallback message when json body is missing", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => {
          throw new Error("No JSON body");
        },
      } as unknown as Response);

      await expect(getJobStatus("non-existent-id")).rejects.toThrow("Job not found.");
    });

    it("handles 500 error response with backend message", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({
          code: "INTERNAL_ERROR",
          message: "An unexpected server error occurred.",
        }),
      } as unknown as Response);

      await expect(getJobStatus("job-id")).rejects.toThrow(
        "An unexpected server error occurred."
      );
    });

    it("handles non-ok response when json parsing fails", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error("Invalid json");
        },
      } as unknown as Response);

      await expect(getJobStatus("job-id")).rejects.toThrow(
        "Failed to fetch job status (status code 502)."
      );
    });

    it("passes abort signal to fetch", async () => {
      const controller = new AbortController();
      globalThis.fetch = vi.fn().mockImplementation((_, options) => {
        if (options?.signal?.aborted) {
          return Promise.reject(new DOMException("The user aborted a request.", "AbortError"));
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockJobResponse,
        });
      });

      controller.abort();
      await expect(getJobStatus("job-id", controller.signal)).rejects.toThrow();
    });

    it("handles network connection failure", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

      await expect(getJobStatus("job-id")).rejects.toThrow("Failed to fetch");
    });
  });
});