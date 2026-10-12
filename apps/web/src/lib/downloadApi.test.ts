import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { downloadFile } from "./downloadApi";

function mockResponse({
  ok = true,
  status = 200,
  statusText = "OK",
  contentDisposition = null as string | null,
  blob = new Blob(["docx content"]),
} = {}) {
  return {
    ok,
    status,
    statusText,
    headers: new Headers(
      contentDisposition ? { "Content-Disposition": contentDisposition } : {},
    ),
    blob: async () => blob,
  } as unknown as Response;
}

describe("downloadApi", () => {
  const originalFetch = globalThis.fetch;
  const originalCreateObjectURL = window.URL.createObjectURL;
  const originalRevokeObjectURL = window.URL.revokeObjectURL;
  let clickSpy: ReturnType<typeof vi.spyOn>;

  function getClickedAnchor() {
    return clickSpy.mock.contexts[0] as HTMLAnchorElement | undefined;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    window.URL.createObjectURL = vi.fn(() => "blob:mock-url");
    window.URL.revokeObjectURL = vi.fn();
    clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it("requests the download endpoint for the given job id", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse());

    await downloadFile("job-123");

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/v1/jobs/job-123/download");
  });

  it("uses the quoted filename from the Content-Disposition header", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockResponse({ contentDisposition: 'attachment; filename="report.docx"' }),
    );

    await downloadFile("job-1");

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(getClickedAnchor()?.download).toBe("report.docx");
    expect(getClickedAnchor()?.href).toBe("blob:mock-url");
  });

  it("parses an unquoted filename from the Content-Disposition header", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockResponse({ contentDisposition: "attachment; filename=output.docx; size=10" }),
    );

    await downloadFile("job-1");

    expect(getClickedAnchor()?.download).toBe("output.docx");
  });

  it("falls back to a default filename when the header is missing", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse());

    await downloadFile("job-1");

    expect(getClickedAnchor()?.download).toBe("downloaded_file.docx");
  });

  it("falls back to a default filename when the header has no filename", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockResponse({ contentDisposition: "attachment" }),
    );

    await downloadFile("job-1");

    expect(getClickedAnchor()?.download).toBe("downloaded_file.docx");
  });

  it("creates an object URL from the response blob", async () => {
    const blob = new Blob(["file bytes"]);
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse({ blob }));

    await downloadFile("job-1");

    expect(window.URL.createObjectURL).toHaveBeenCalledWith(blob);
  });

  it("removes the temporary anchor from the DOM after clicking", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse());

    await downloadFile("job-1");

    const clickedAnchor = getClickedAnchor();
    expect(clickedAnchor).toBeDefined();
    expect(document.body.contains(clickedAnchor!)).toBe(false);
    expect(document.querySelectorAll("a[download]")).toHaveLength(0);
  });

  it("revokes the object URL after a delay", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse());

    await downloadFile("job-1");

    expect(window.URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  it("throws with status details when the response is not ok", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockResponse({ ok: false, status: 404, statusText: "Not Found" }),
    );

    await expect(downloadFile("missing")).rejects.toThrow("HTTP 404 - Not Found");
    expect(window.URL.createObjectURL).not.toHaveBeenCalled();
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("propagates network errors from fetch", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(downloadFile("job-1")).rejects.toThrow("Failed to fetch");
    expect(clickSpy).not.toHaveBeenCalled();
  });
});
