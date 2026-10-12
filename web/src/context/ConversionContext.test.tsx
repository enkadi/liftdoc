import { describe, expect, it, vi } from "vitest";
import { render, renderHook, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConversionProvider, useConversion } from "./ConversionContext";
import type { ConversionSession } from "@/lib/conversionSession";
import type { JobStatusResponse } from "@/lib/jobApi";
import { toast } from "sonner";

let pollingOnComplete: ((data: JobStatusResponse) => void) | undefined;

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/lib/useJobPolling", () => ({
  useJobPolling: (options: { onComplete?: (data: JobStatusResponse) => void }) => {
    pollingOnComplete = options.onComplete;
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return <ConversionProvider>{children}</ConversionProvider>;
}

describe("useConversion", () => {
  it("throws when used outside of a ConversionProvider", () => {
    expect(() => renderHook(() => useConversion())).toThrow(
      "useConversion must be used within ConversionProvider",
    );
  });

  it("provides sane defaults", () => {
    const { result } = renderHook(() => useConversion(), { wrapper });

    expect(result.current.file).toBeNull();
    expect(result.current.resetKey).toBe(0);
    expect(result.current.activeView).toBe("upload");
  });

  it("sets and clears the file", () => {
    const { result } = renderHook(() => useConversion(), { wrapper });
    const file = new File(["hello"], "hello.pdf", { type: "application/pdf" });

    act(() => result.current.setFile(file));
    expect(result.current.file).toBe(file);

    act(() => result.current.clearFile());
    expect(result.current.file).toBeNull();
  });

  it("updates the active view", () => {
    const { result } = renderHook(() => useConversion(), { wrapper });

    act(() => result.current.setActiveView("progress"));
    expect(result.current.activeView).toBe("progress");
  });

  it("memoizes setFile and clearFile across provider re-renders", () => {
    const { result } = renderHook(() => useConversion(), { wrapper });
    const initialSetFile = result.current.setFile;
    const initialClearFile = result.current.clearFile;

    act(() => {
      result.current.setActiveView("progress");
    });

    expect(result.current.setFile).toBe(initialSetFile);
    expect(result.current.clearFile).toBe(initialClearFile);
  });

  it("reset clears the file, bumps resetKey, and returns to the upload view", () => {
    const { result } = renderHook(() => useConversion(), { wrapper });
    const file = new File(["hello"], "hello.pdf", { type: "application/pdf" });

    act(() => {
      result.current.setFile(file);
      result.current.setActiveView("progress");
    });
    expect(result.current.resetKey).toBe(0);

    act(() => result.current.reset());

    expect(result.current.file).toBeNull();
    expect(result.current.resetKey).toBe(1);
    expect(result.current.activeView).toBe("upload");
  });

  it("shares state between components under the same provider", async () => {
    const user = userEvent.setup();

    function Reader() {
      const { activeView } = useConversion();
      return <p>view:{activeView}</p>;
    }

    function Writer() {
      const { setActiveView } = useConversion();
      return (
        <button onClick={() => setActiveView("progress")}>go</button>
      );
    }

    render(
      <ConversionProvider>
        <Reader />
        <Writer />
      </ConversionProvider>,
    );

    expect(screen.getByText("view:upload")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "go" }));

    expect(screen.getByText("view:progress")).toBeInTheDocument();
  });

  it("returns null when startConversion is called without a selected file", async () => {
    const { result } = renderHook(() => useConversion(), { wrapper });

    let session: ConversionSession | null = null;
    await act(async () => {
      session = await result.current.startConversion();
    });

    expect(session).toBeNull();
    expect(result.current.session).toBeNull();
    expect(result.current.activeView).toBe("upload");
  });

  it("returns a session with backend jobId when startConversion is called with a file or fileOverride", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ jobId: 123 }),
    } as unknown as Response);

    const { result } = renderHook(() => useConversion(), { wrapper });
    const file = new File(["pdf"], "doc.pdf", { type: "application/pdf" });

    let session: ConversionSession | null = null;
    await act(async () => {
      session = await result.current.startConversion(file);
    });

    expect(session).not.toBeNull();
    expect((session as ConversionSession | null)?.jobId).toBe("123");
    expect((session as ConversionSession | null)?.fileName).toBe("doc.pdf");
    expect(result.current.activeView).toBe("progress");
  });

  it("does not create session or switch view when backend validation fails", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: "Only PDF files are supported." }),
    } as unknown as Response);

    const { result } = renderHook(() => useConversion(), { wrapper });
    const file = new File(["txt"], "doc.txt", { type: "text/plain" });

    let session: ConversionSession | null = null;
    await act(async () => {
      session = await result.current.startConversion(file);
    });

    expect(session).toBeNull();
    expect(result.current.session).toBeNull();
    expect(result.current.activeView).toBe("upload");
    expect(result.current.isUploading).toBe(false);
    expect(result.current.isConverting).toBe(false);
  });

  it("correctly distinguishes isUploading and isConverting flags", async () => {
    let resolveFetch: (val: unknown) => void;
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });

    globalThis.fetch = vi.fn().mockImplementation(() => fetchPromise);

    const { result } = renderHook(() => useConversion(), { wrapper });
    const file = new File(["pdf"], "doc.pdf", { type: "application/pdf" });

    // Initial state
    expect(result.current.isUploading).toBe(false);
    expect(result.current.isConverting).toBe(false);

    // Start conversion (in-flight request)
    let startPromise: Promise<ConversionSession | null>;
    act(() => {
      startPromise = result.current.startConversion(file);
    });

    // While uploading & validating
    expect(result.current.isUploading).toBe(true);
    expect(result.current.isConverting).toBe(false);

    // Resolve fetch
    await act(async () => {
      resolveFetch!({
        ok: true,
        status: 201,
        json: async () => ({ jobId: 888 }),
      } as unknown as Response);
      await startPromise;
    });

    // Once acquired real jobId and session created
    expect(result.current.isUploading).toBe(false);
    expect(result.current.isConverting).toBe(true);
  });

  it("resetKeepFile clears session and returns to upload view while retaining the uploaded file", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ jobId: 456 }),
    } as unknown as Response);

    const { result } = renderHook(() => useConversion(), { wrapper });
    const file = new File(["hello"], "hello.pdf", { type: "application/pdf" });

    await act(async () => {
      result.current.setFile(file);
    });
    await act(async () => {
      await result.current.startConversion(file);
    });
    act(() => {
      result.current.updateStatus("failed");
    });

    expect(result.current.file).toBe(file);
    expect(result.current.session?.status).toBe("failed");

    act(() => result.current.resetKeepFile());

    expect(result.current.session).toBeNull();
    expect(result.current.file).toBe(file);
    expect(result.current.activeView).toBe("upload");
  });

  it("tracks conversion duration on completion", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ jobId: 789 }),
    } as unknown as Response);

    const { result } = renderHook(() => useConversion(), { wrapper });
    const file = new File(["pdf"], "doc.pdf", { type: "application/pdf" });

    await act(async () => {
      await result.current.startConversion(file);
    });

    act(() => {
      result.current.updateStatus("done", 15, 48213);
    });

    expect(result.current.session?.status).toBe("done");
    expect(result.current.session?.durationSeconds).toBe(15);
    expect(result.current.session?.outputSizeBytes).toBe(48213);
  });

  it("shows success and auto-purge warning toasts on completion", () => {
    vi.useFakeTimers();
    renderHook(() => useConversion(), { wrapper });

    expect(pollingOnComplete).toBeDefined();

    act(() => {
      pollingOnComplete?.({
        jobId: "job-123",
        status: "DONE",
        sourceFilename: "doc.pdf",
        pageCount: 1,
        createdAt: "2026-10-08T11:00:00Z",
        completedAt: "2026-10-08T11:01:00Z",
        durationSeconds: 60,
        output: {
          filename: "doc.docx",
          sizeBytes: 1024,
          downloadUrl: "/api/v1/jobs/job-123/download",
        },
        metrics: null,
      });
    });

    expect(toast.success).toHaveBeenCalledWith(
      "Conversion complete!",
      expect.objectContaining({
        description: expect.stringContaining("ready for download"),
      }),
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(toast.warning).toHaveBeenCalledWith(
      "Auto-Purge Warning",
      expect.objectContaining({
        description: expect.stringContaining("30 minutes"),
      }),
    );

    vi.useRealTimers();
  });

  it("resets state when 30-minute purge expires", async () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);

    const { result } = renderHook(() => useConversion(), { wrapper });

    const thirtyMinutesAgo = now - 30 * 60 * 1000;

    act(() => {
      result.current.setSession({
        jobId: "session-123",
        fileName: "file.pdf",
        status: "done",
        createdAt: thirtyMinutesAgo,
        completedAt: thirtyMinutesAgo,
        updatedAt: thirtyMinutesAgo,
      });
      result.current.setActiveView("result");
    });

    // Advance timers so usePurgeCountdown runs and hits 0
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(toast.error).toHaveBeenCalledWith(
      "File Purged",
      expect.objectContaining({
        description: expect.stringContaining("no longer available"),
      }),
    );

    // After 2 seconds, it should automatically reset and move to upload screen
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.session).toBeNull();
    expect(result.current.activeView).toBe("upload");

    vi.useRealTimers();
  });
});
