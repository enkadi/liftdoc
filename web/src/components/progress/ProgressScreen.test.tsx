import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useEffect } from "react";
import ProgressScreen from "./ProgressScreen";
import { ConversionProvider, useConversion } from "@/context/ConversionContext";
import { saveConversionSession, clearConversionSession } from "@/lib/conversionSession";
import type { JobStatusResponse } from "@/lib/pollingApi";

const mocks = vi.hoisted(() => ({
  job: null as JobStatusResponse | null,
  useJobStatus: vi.fn(),
}));

vi.mock("@/app/hooks/useJobStatus", () => ({
  useJobStatus: (jobId: string | null) => {
    mocks.useJobStatus(jobId);
    return { job: mocks.job, error: null, notFound: false };
  },
}));

vi.mock("./HeaderBar", () => ({
  default: ({
    file,
    timeRemaining,
  }: {
    file: File | null;
    timeRemaining: number | null;
  }) => (
    <div data-testid="header-bar">
      {file ? file.name : "no file"}
      <span data-testid="time-remaining">{String(timeRemaining)}</span>
    </div>
  ),
}));

vi.mock("./ProgressCard", () => ({
  default: () => <div data-testid="progress-card" />,
}));

function makeJob(overrides: Partial<JobStatusResponse> = {}): JobStatusResponse {
  return {
    jobId: "job-1",
    status: "PROCESSING",
    sourceFilename: "sample.pdf",
    pageCount: 3,
    createdAt: null,
    startedAt: null,
    completedAt: null,
    phase: "EXTRACTING_CONTENT",
    progressPercent: 40,
    durationSeconds: null,
    estimatedRemainingSeconds: null,
    estimatedTotalSeconds: null,
    currentPhaseEstimatedRemainingSeconds: null,
    output: null,
    metrics: null,
    ...overrides,
  };
}

function renderWithActiveSession() {
  saveConversionSession({
    jobId: "job-1",
    fileName: "sample.pdf",
    status: "processing",
    updatedAt: Date.now(),
  });
  render(
    <ConversionProvider>
      <ProgressScreen />
    </ConversionProvider>,
  );
}

describe("ProgressScreen", () => {
  beforeEach(() => {
    mocks.job = null;
    mocks.useJobStatus.mockClear();
    clearConversionSession();
  });

  it("polls the job from the active session", async () => {
    renderWithActiveSession();
    await screen.findByTestId("header-bar");
    expect(mocks.useJobStatus).toHaveBeenLastCalledWith("job-1");
  });

  it("does not poll when there is no active session", () => {
    render(
      <ConversionProvider>
        <ProgressScreen />
      </ConversionProvider>,
    );
    expect(mocks.useJobStatus).toHaveBeenLastCalledWith(null);
  });

  it("passes the backend's overall time remaining to the header bar", async () => {
    mocks.job = makeJob({ estimatedRemainingSeconds: 12.4 });
    renderWithActiveSession();
    expect(await screen.findByTestId("time-remaining")).toHaveTextContent("12.4");
  });

  it("passes null to the header bar while the backend has no estimate", async () => {
    mocks.job = makeJob({ estimatedRemainingSeconds: null });
    renderWithActiveSession();
    expect(await screen.findByTestId("time-remaining")).toHaveTextContent("null");
  });

  it("renders the header bar and the progress card", () => {
    render(
      <ConversionProvider>
        <ProgressScreen />
      </ConversionProvider>,
    );

    expect(screen.getByTestId("header-bar")).toBeInTheDocument();
    expect(screen.getByTestId("progress-card")).toBeInTheDocument();
  });

  it("passes the file from context down to the header bar", () => {
    const file = new File(["%PDF-1.4"], "contract.pdf", {
      type: "application/pdf",
    });

    function SetFileThenRender() {
      const { setFile } = useConversion();
      useEffect(() => setFile(file), [setFile]);
      return <ProgressScreen />;
    }

    render(
      <ConversionProvider>
        <SetFileThenRender />
      </ConversionProvider>,
    );

    expect(screen.getByTestId("header-bar")).toHaveTextContent("contract.pdf");
  });

  it("automatically navigates to the result view 2 seconds after conversion is done", () => {
    vi.useFakeTimers();

    function ViewProbe() {
      const { activeView, setSession } = useConversion();

      useEffect(() => {
        setSession({
          jobId: "j1",
          fileName: "doc.pdf",
          status: "done",
          updatedAt: Date.now(),
        });
      }, [setSession]);

      return (
        <div>
          <ProgressScreen />
          <p>active:{activeView}</p>
        </div>
      );
    }

    render(
      <ConversionProvider>
        <ViewProbe />
      </ConversionProvider>,
    );

    expect(screen.getByText("active:upload")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByText("active:result")).toBeInTheDocument();

    vi.useRealTimers();
  });
});
