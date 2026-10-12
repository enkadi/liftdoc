import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import JobStepper, {
  buildJobSteps,
  getActiveStepIndex,
  getOverallPercent,
  getProgressCeiling,
  JOB_STEPS,
} from "./JobStepper";
import type { JobStatusResponse } from "@/lib/pollingApi";

function makeJob(overrides: Partial<JobStatusResponse> = {}): JobStatusResponse {
  return {
    jobId: "job-1",
    status: "PROCESSING",
    sourceFilename: "sample.pdf",
    pageCount: 4,
    createdAt: null,
    startedAt: null,
    completedAt: null,
    phase: "LOADING_SOURCE",
    progressPercent: 0,
    durationSeconds: null,
    estimatedRemainingSeconds: null,
    estimatedTotalSeconds: null,
    currentPhaseEstimatedRemainingSeconds: null,
    output: null,
    metrics: null,
    ...overrides,
  };
}

describe("getActiveStepIndex", () => {
  it("is -1 with no job or while queued", () => {
    expect(getActiveStepIndex(null)).toBe(-1);
    expect(getActiveStepIndex(makeJob({ status: "QUEUED", phase: "QUEUED" }))).toBe(-1);
  });

  it("maps each backend phase to its step", () => {
    JOB_STEPS.forEach((step, i) => {
      expect(getActiveStepIndex(makeJob({ phase: step.phase }))).toBe(i);
    });
  });

  it("is past the last step when done", () => {
    expect(
      getActiveStepIndex(makeJob({ status: "DONE", phase: "COMPLETED" })),
    ).toBe(JOB_STEPS.length);
  });
});

describe("getProgressCeiling", () => {
  it("is just below the next step's start while processing", () => {
    expect(
      getProgressCeiling(makeJob({ phase: "EXTRACTING_CONTENT", progressPercent: 25 })),
    ).toBe(54);
    expect(
      getProgressCeiling(makeJob({ phase: "SAVING_OUTPUT", progressPercent: 90 })),
    ).toBe(99);
  });

  it("equals the current percent when there is nothing to creep towards", () => {
    expect(getProgressCeiling(null)).toBe(0);
    expect(getProgressCeiling(makeJob({ status: "QUEUED", phase: "QUEUED", progressPercent: 0 }))).toBe(0);
    expect(getProgressCeiling(makeJob({ status: "DONE", phase: "COMPLETED", progressPercent: 100 }))).toBe(100);
    expect(getProgressCeiling(makeJob({ status: "FAILED", phase: "EXTRACTING_CONTENT", progressPercent: 25 }))).toBe(25);
  });
});

describe("getOverallPercent", () => {
  it("uses progressPercent, clamped, and 100 when done", () => {
    expect(getOverallPercent(null)).toBe(0);
    expect(getOverallPercent(makeJob({ progressPercent: 55 }))).toBe(55);
    expect(getOverallPercent(makeJob({ progressPercent: null }))).toBe(0);
    expect(getOverallPercent(makeJob({ progressPercent: 140 }))).toBe(100);
    expect(getOverallPercent(makeJob({ status: "DONE", progressPercent: 90 }))).toBe(100);
  });
});

describe("buildJobSteps", () => {
  it("marks earlier steps complete, the current one loading, later ones pending", () => {
    const steps = buildJobSteps(makeJob({ phase: "RECOVERING_STRUCTURE" }));
    expect(steps.map((s) => s.status)).toEqual([
      "complete",
      "complete",
      "loading",
      "pending",
      "pending",
    ]);
    expect(steps[0].tags).toEqual([{ label: "4 pages" }]);
  });

  it("marks the current step as errored when the job failed", () => {
    const steps = buildJobSteps(
      makeJob({ status: "FAILED", phase: "GENERATING_DOCUMENT" }),
    );
    expect(steps[3].status).toBe("error");
    expect(steps[4].meta).toBe("Skipped");
  });

  it("marks every step complete when done, with word count tags", () => {
    const steps = buildJobSteps(
      makeJob({
        status: "DONE",
        phase: "COMPLETED",
        metrics: { sourceWordCount: 1200, outputWordCount: 1180 },
      }),
    );
    expect(steps.every((s) => s.status === "complete")).toBe(true);
    expect(steps[1].tags?.[0].label).toMatch(/words extracted/);
    expect(steps[3].tags?.[0].label).toMatch(/words written/);
  });

  it("leaves every step pending with no job", () => {
    expect(buildJobSteps(null).every((s) => s.status === "pending")).toBe(true);
  });
});

describe("JobStepper", () => {
  it("renders a row per pipeline step", () => {
    render(<JobStepper job={makeJob({ phase: "EXTRACTING_CONTENT" })} />);
    JOB_STEPS.forEach((step) => {
      expect(screen.getByText(step.title)).toBeInTheDocument();
    });
    expect(screen.getByText("Parsing page content")).toBeInTheDocument();
  });
});
