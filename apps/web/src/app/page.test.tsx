import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import Home from "./page";
import { ConversionProvider, useConversion } from "@/context/ConversionContext";
import { saveConversionSession, clearConversionSession, getConversionSession } from "@/lib/conversionSession";

vi.mock("@/components/upload/UploadScreen", () => ({
  default: () => <div data-testid="upload-screen" />,
}));

vi.mock("@/components/progress/ProgressScreen", () => ({
  default: () => <div data-testid="progress-screen" />,
}));

vi.mock("@/components/results/ResultsScreen", () => ({
  default: () => <div data-testid="results-screen" />,
}));

describe("Home", () => {
  beforeEach(() => {
    clearConversionSession();
  });

  it("renders the upload screen by default when no session exists", () => {
    render(
      <ConversionProvider>
        <Home />
      </ConversionProvider>,
    );

    expect(screen.getByTestId("upload-screen")).toBeInTheDocument();
    expect(screen.queryByTestId("progress-screen")).not.toBeInTheDocument();
  });

  it("recovers stored 'processing' or 'queued' session and renders the progress screen", () => {
    saveConversionSession({
      jobId: "job_proc",
      fileName: "report.pdf",
      status: "processing",
      updatedAt: Date.now(),
    });

    render(
      <ConversionProvider>
        <Home />
      </ConversionProvider>,
    );

    expect(screen.getByTestId("progress-screen")).toBeInTheDocument();
    expect(screen.queryByTestId("upload-screen")).not.toBeInTheDocument();
  });

  it("recovers stored 'done' session and renders the results screen", () => {
    saveConversionSession({
      jobId: "job_done",
      fileName: "report.pdf",
      status: "done",
      updatedAt: Date.now(),
    });

    render(
      <ConversionProvider>
        <Home />
      </ConversionProvider>,
    );

    expect(screen.getByTestId("results-screen")).toBeInTheDocument();
    expect(screen.queryByTestId("upload-screen")).not.toBeInTheDocument();
  });

  it("recovers stored 'failed' session and renders the progress screen", () => {
    saveConversionSession({
      jobId: "job_failed",
      fileName: "report.pdf",
      status: "failed",
      updatedAt: Date.now(),
    });

    render(
      <ConversionProvider>
        <Home />
      </ConversionProvider>,
    );

    expect(screen.getByTestId("progress-screen")).toBeInTheDocument();
    expect(screen.queryByTestId("upload-screen")).not.toBeInTheDocument();
  });

  it("cleans up expired sessions and renders the upload screen", () => {
    saveConversionSession({
      jobId: "job_expired",
      fileName: "report.pdf",
      status: "expired",
      updatedAt: Date.now(),
    });

    render(
      <ConversionProvider>
        <Home />
      </ConversionProvider>,
    );

    expect(screen.getByTestId("upload-screen")).toBeInTheDocument();
    expect(getConversionSession()).toBeNull();
  });

  it("renders the progress screen once the active view switches to progress in memory", () => {
    function SwitchToProgress() {
      const { setActiveView } = useConversion();
      useEffect(() => setActiveView("progress"), [setActiveView]);
      return <Home />;
    }

    render(
      <ConversionProvider>
        <SwitchToProgress />
      </ConversionProvider>,
    );

    expect(screen.getByTestId("progress-screen")).toBeInTheDocument();
    expect(screen.queryByTestId("upload-screen")).not.toBeInTheDocument();
  });
});
