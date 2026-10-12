import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { JobStatusResponse } from "@/lib/pollingApi";
import type { ConversionSession } from "@/lib/conversionSession";

const mocks = vi.hoisted(() => ({
  job: null as JobStatusResponse | null,
  notFound: false,
  session: null as ConversionSession | null,
  updateStatus: vi.fn(),
}));

vi.mock("@/context/ConversionContext", () => ({
  useConversion: () => ({
    session: mocks.session,
    updateStatus: mocks.updateStatus,
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import ProgressCard from "./ProgressCard";
import { toast } from "sonner";

function makeJob(overrides: Partial<JobStatusResponse> = {}): JobStatusResponse {
  return {
    jobId: "job-1",
    status: "PROCESSING",
    sourceFilename: "sample.pdf",
    pageCount: 3,
    createdAt: null,
    startedAt: null,
    completedAt: null,
    phase: "LOADING_SOURCE",
    progressPercent: 10,
    durationSeconds: null,
    estimatedRemainingSeconds: null,
    estimatedTotalSeconds: null,
    currentPhaseEstimatedRemainingSeconds: null,
    output: null,
    metrics: null,
    ...overrides,
  };
}

function makeSession(
  overrides: Partial<ConversionSession> = {},
): ConversionSession {
  return {
    jobId: "job-1",
    fileName: "sample.pdf",
    status: "processing",
    updatedAt: 0,
    ...overrides,
  };
}

describe("ProgressCard", () => {
  beforeEach(() => {
    mocks.job = null;
    mocks.notFound = false;
    mocks.session = makeSession();
    mocks.updateStatus.mockClear();
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it("renders a queued state before any status arrives", () => {
    render(<ProgressCard job={mocks.job} notFound={mocks.notFound} />);

    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByText("Queued:")).toBeInTheDocument();
    expect(screen.getByText("Waiting in queue...")).toBeInTheDocument();
  });

  it("reflects the backend phase and progress percent", () => {
    mocks.job = makeJob({ phase: "RECOVERING_STRUCTURE", progressPercent: 55 });
    render(<ProgressCard job={mocks.job} notFound={mocks.notFound} />);

    expect(screen.getByText("55%")).toBeInTheDocument();
    expect(screen.getByText("Phase 3 of 5:")).toBeInTheDocument();
    expect(
      screen.getByText("Reconstructing tables, headings, lists and paragraphs..."),
    ).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
  });

  it("marks the session done with the backend duration when the job finishes", () => {
    mocks.job = makeJob({
      status: "DONE",
      phase: "COMPLETED",
      progressPercent: 100,
      durationSeconds: 12,
      output: {
        filename: "sample.docx",
        sizeBytes: 48213,
        downloadUrl: "/api/v1/jobs/job-1/download",
      },
    });
    render(<ProgressCard job={mocks.job} notFound={mocks.notFound} />);

    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("Phase 5 of 5:")).toBeInTheDocument();
    expect(mocks.updateStatus).toHaveBeenCalledWith("done", 12, 48213);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("marks the session failed when the job fails", () => {
    mocks.job = makeJob({ status: "FAILED", phase: "EXTRACTING_CONTENT" });
    render(<ProgressCard job={mocks.job} notFound={mocks.notFound} />);

    expect(mocks.updateStatus).toHaveBeenCalledWith("failed");
    expect(toast.error).toHaveBeenCalledWith("Conversion failed");
  });

  it("marks the session failed when the job no longer exists", () => {
    mocks.notFound = true;
    render(<ProgressCard job={mocks.job} notFound={mocks.notFound} />);

    expect(mocks.updateStatus).toHaveBeenCalledWith("failed");
  });

  it("renders the error state card when the session has failed", () => {
    mocks.session = makeSession({ status: "failed" });
    render(<ProgressCard job={mocks.job} notFound={mocks.notFound} />);

    expect(
      screen.getByRole("heading", { name: /conversion couldn't be completed/i }),
    ).toBeInTheDocument();
  });

  it("does not render the error state card by default", () => {
    render(<ProgressCard job={mocks.job} notFound={mocks.notFound} />);

    expect(
      screen.queryByRole("heading", { name: /conversion couldn't be completed/i }),
    ).not.toBeInTheDocument();
  });
});
