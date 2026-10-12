import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { uploadFile } from "./uploadApi";
import { UploadApiError } from "./errorMapping";

describe("uploadApi", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("uploads file successfully and returns jobId", async () => {
    const mockFile = new File(["dummy content"], "test.pdf", { type: "application/pdf" });
    const mockResponse = { jobId: 42 };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => mockResponse,
    } as unknown as Response);

    const result = await uploadFile(mockFile);

    expect(result).toEqual({ jobId: 42 });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/api/v1/uploads");
    expect(options.method).toBe("POST");
    expect(options.body).toBeInstanceOf(FormData);
  });

  it("handles API error responses with custom backend error message", async () => {
    const mockFile = new File(["dummy content"], "test.txt", { type: "text/plain" });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "INVALID_PDF", message: "Only PDF files are supported." }),
    } as unknown as Response);

    await expect(uploadFile(mockFile)).rejects.toThrow("Only PDF files are supported.");
  });

  it("handles 413 with backend JSON message when available", async () => {
    const mockFile = new File(["dummy content"], "test.pdf", { type: "application/pdf" });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 413,
      json: async () => ({ error: "FILE_TOO_LARGE", message: "The uploaded PDF exceeds the maximum allowed size." }),
    } as unknown as Response);

    await expect(uploadFile(mockFile)).rejects.toThrow(
      "The uploaded PDF exceeds the maximum allowed size."
    );
  });

  it("handles 413 with fallback message when JSON body is missing", async () => {
    const mockFile = new File(["dummy content"], "test.pdf", { type: "application/pdf" });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 413,
      json: async () => {
        throw new Error("No JSON body");
      },
    } as unknown as Response);

    await expect(uploadFile(mockFile)).rejects.toThrow(
      "File is too large. Please upload a PDF smaller than 10MB."
    );
  });

  it("handles 500 error responses with user-friendly error instead of raw status codes", async () => {
    const mockFile = new File(["dummy content"], "test.pdf", { type: "application/pdf" });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("SyntaxError");
      },
    } as unknown as Response);

    try {
      await uploadFile(mockFile);
      expect.unreachable("Should have thrown UploadApiError");
    } catch (err) {
      expect(err).toBeInstanceOf(UploadApiError);
      const apiErr = err as UploadApiError;
      expect(apiErr.title).toBe("Conversion Service Error");
      expect(apiErr.description).toContain("The conversion server encountered an unexpected error.");
      expect(apiErr.message).not.toContain("status code 500");
    }
  });

  it("handles encrypted PDF error with clear instructions", async () => {
    const mockFile = new File(["dummy content"], "test.pdf", { type: "application/pdf" });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "ENCRYPTED_PDF", message: "Encrypted PDFs are not supported." }),
    } as unknown as Response);

    try {
      await uploadFile(mockFile);
      expect.unreachable("Should have thrown UploadApiError");
    } catch (err) {
      expect(err).toBeInstanceOf(UploadApiError);
      const apiErr = err as UploadApiError;
      expect(apiErr.title).toBe("Password-Protected PDF");
      expect(apiErr.description).toContain("Password-protected or encrypted PDFs cannot be converted.");
    }
  });

  it("handles gateway 502/503 errors gracefully", async () => {
    const mockFile = new File(["dummy content"], "test.pdf", { type: "application/pdf" });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("HTML Bad Gateway");
      },
    } as unknown as Response);

    try {
      await uploadFile(mockFile);
      expect.unreachable("Should have thrown UploadApiError");
    } catch (err) {
      expect(err).toBeInstanceOf(UploadApiError);
      const apiErr = err as UploadApiError;
      expect(apiErr.title).toBe("Server Temporarily Unavailable");
      expect(apiErr.description).toContain("unreachable");
    }
  });

  it("handles network connection failures with connection guidance", async () => {
    const mockFile = new File(["dummy content"], "test.pdf", { type: "application/pdf" });

    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    try {
      await uploadFile(mockFile);
      expect.unreachable("Should have thrown UploadApiError");
    } catch (err) {
      expect(err).toBeInstanceOf(UploadApiError);
      const apiErr = err as UploadApiError;
      expect(apiErr.title).toBe("Connection Failed");
      expect(apiErr.description).toContain("internet connection");
    }
  });
});
