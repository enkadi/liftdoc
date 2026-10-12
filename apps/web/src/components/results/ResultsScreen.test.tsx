import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResultsScreen from "./ResultsScreen";
import { ConversionProvider, useConversion } from "@/context/ConversionContext";
import { saveConversionSession } from "@/lib/conversionSession";

function TestWrapper() {
  const { file, resetKey, activeView, setFile, setActiveView } = useConversion();
  return (
    <div>
      <div data-testid="file-state">{file ? file.name : "no-file"}</div>
      <div data-testid="reset-key">{resetKey}</div>
      <div data-testid="active-view">{activeView}</div>
      <button
        onClick={() => {
          setFile(new File(["test"], "sample.pdf", { type: "application/pdf" }));
          setActiveView("result");
        }}
      >
        Set Result State
      </button>
      <ResultsScreen />
    </div>
  );
}

describe("ResultsScreen", () => {
  it("renders conversion complete and action buttons", () => {
    render(
      <ConversionProvider>
        <ResultsScreen />
      </ConversionProvider>,
    );

    expect(screen.getByText("Conversion Completed")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /convert another file/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /download/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the output file size and conversion time from the session", async () => {
    saveConversionSession({
      jobId: "job-123",
      fileName: "report.pdf",
      status: "done",
      updatedAt: Date.now(),
      durationSeconds: 17.6,
      fileSize: 5 * 1024 * 1024,
      outputSizeBytes: 48213,
    });

    render(
      <ConversionProvider>
        <ResultsScreen />
      </ConversionProvider>,
    );

    expect(
      await screen.findByText("47.1 KB • 18s conversion time"),
    ).toBeInTheDocument();
  });

  it("shows conversion duration in milliseconds when under 1 second", async () => {
    saveConversionSession({
      jobId: "job-ms-123",
      fileName: "quick.pdf",
      status: "done",
      updatedAt: Date.now(),
      durationSeconds: 0.45,
      fileSize: 2 * 1024 * 1024,
      outputSizeBytes: 20480,
    });

    render(
      <ConversionProvider>
        <ResultsScreen />
      </ConversionProvider>,
    );

    expect(
      await screen.findByText(/20\.0 KB • \d+ms conversion time/),
    ).toBeInTheDocument();
  });

  it("renders the download button when a completed session has a jobId", async () => {
    saveConversionSession({
      jobId: "job-123",
      fileName: "report.pdf",
      status: "done",
      updatedAt: Date.now(),
    });

    render(
      <ConversionProvider>
        <ResultsScreen />
      </ConversionProvider>,
    );

    expect(
      await screen.findByRole("button", { name: /download/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("report.docx")).toBeInTheDocument();
  });

  it("calls reset() when 'Convert Another File' is clicked, resetting app state and view", async () => {
    const user = userEvent.setup();
    render(
      <ConversionProvider>
        <TestWrapper />
      </ConversionProvider>,
    );

    // Set initial file and result state
    await user.click(screen.getByRole("button", { name: "Set Result State" }));
    expect(screen.getByTestId("file-state")).toHaveTextContent("sample.pdf");
    expect(screen.getByTestId("reset-key")).toHaveTextContent("0");
    expect(screen.getByTestId("active-view")).toHaveTextContent("result");

    // Click Convert Another File
    await user.click(screen.getByRole("button", { name: /convert another file/i }));

    // Verify reset() was called: file cleared, resetKey incremented, view set to upload
    expect(screen.getByTestId("file-state")).toHaveTextContent("no-file");
    expect(screen.getByTestId("reset-key")).toHaveTextContent("1");
    expect(screen.getByTestId("active-view")).toHaveTextContent("upload");
  });

  it("renders dynamic output metadata, page count, and metrics when present", async () => {
    saveConversionSession({
      jobId: "job-dynamic-456",
      fileName: "financials.pdf",
      status: "done",
      updatedAt: Date.now(),
      pageCount: 8,
      durationSeconds: 12,
      output: {
        filename: "financials_final.docx",
        sizeBytes: 25600,
        downloadUrl: "/api/v1/jobs/job-dynamic-456/download",
      },
      metrics: {
        sourceWordCount: 5000,
        outputWordCount: 4950,
      },
    });

    render(
      <ConversionProvider>
        <ResultsScreen />
      </ConversionProvider>,
    );

    expect(await screen.findByText("financials_final.docx")).toBeInTheDocument();
    expect(screen.getByText(/25\.0 KB • 12s conversion time/i)).toBeInTheDocument();
    expect(screen.getByText("4,950 Words")).toBeInTheDocument();
    expect(screen.getAllByText("99%").length).toBeGreaterThan(0);
  });

  it("formats text yield to one decimal place when not a whole number", async () => {
    saveConversionSession({
      jobId: "job-dynamic-789",
      fileName: "annual_report.pdf",
      status: "done",
      updatedAt: Date.now(),
      metrics: {
        sourceWordCount: 1000,
        outputWordCount: 985,
      },
    });

    render(
      <ConversionProvider>
        <ResultsScreen />
      </ConversionProvider>,
    );

    expect((await screen.findAllByText("98.5%")).length).toBeGreaterThan(0);
  });

  it("renders dynamic list reconstruction metrics when list metrics are present", async () => {
    saveConversionSession({
      jobId: "job-dynamic-lists-101",
      fileName: "manual.pdf",
      status: "done",
      updatedAt: Date.now(),
      metrics: {
        sourceWordCount: 2000,
        outputWordCount: 1980,
        orderedListsDetected: 3,
        unorderedListsDetected: 5,
        orderedListsReconstructed: 3,
        unorderedListsReconstructed: 4,
      },
    });

    render(
      <ConversionProvider>
        <ResultsScreen />
      </ConversionProvider>,
    );

    expect(await screen.findByText("7/8 Lists Reconstructed")).toBeInTheDocument();
    expect(
      screen.getByText(/Reconstructed 7 of 8 list structures detected in the source PDF/i)
    ).toBeInTheDocument();
  });

  it("renders all newly exposed metrics dynamically (headings, tables, images, multi-column)", async () => {
    saveConversionSession({
      jobId: "job-all-metrics-999",
      fileName: "complete_doc.pdf",
      status: "done",
      updatedAt: Date.now(),
      metrics: {
        sourceWordCount: 1500,
        outputWordCount: 1490,
        headingsDetected: 14,
        h1HeadingCount: 4,
        h2HeadingCount: 6,
        h3HeadingCount: 4,
        tablesDetected: 5,
        imagesDetected: 9,
        multiColumnPageCount: 3,
      },
    });

    render(
      <ConversionProvider>
        <ResultsScreen />
      </ConversionProvider>,
    );

    expect(await screen.findByText("14 Headings Mapped")).toBeInTheDocument();
    expect(screen.getByText("3 Multi-Column Pages")).toBeInTheDocument();
    expect(screen.getByText("9 Assets")).toBeInTheDocument();
    expect(screen.getByText("Mapped")).toBeInTheDocument();
    expect(screen.getByText("Grids Rebuilt")).toBeInTheDocument();
    expect(screen.getAllByText("Embedded Assets").length).toBeGreaterThan(0);
  });
});
