import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FidelityScoreCard, computeFidelityScoreData } from "./FidelityScoreCard";
import type { ConversionSession } from "@/lib/conversionSession";

describe("FidelityScoreCard", () => {
  it("computes fidelity score and breakdown correctly from session metrics", () => {
    const session: ConversionSession = {
      jobId: "job-1",
      fileName: "test.pdf",
      status: "done",
      updatedAt: Date.now(),
      pageCount: 10,
      metrics: {
        sourceWordCount: 1000,
        outputWordCount: 990,
        outputPageCount: 10,
        orderedListsDetected: 2,
        unorderedListsDetected: 2,
        orderedListsReconstructed: 2,
        unorderedListsReconstructed: 2,
        headingsDetected: 5,
        tablesDetected: 3,
        imagesDetected: 4,
      },
    };

    const data = computeFidelityScoreData(session);
    expect(data.compositeFidelityPercent).toBe(99.8);
    expect(data.contributors).toHaveLength(6);
    expect(data.contributors[0].name).toBe("Word Preservation");
    expect(data.contributors[0].detail).toBe("990 / 1,000 Words");
    expect(data.contributors[0].formattedScore).toBe("99.0%");
  });

  it("renders the composite fidelity score and handles hover to toggle dropdown", () => {
    const session: ConversionSession = {
      jobId: "job-2",
      fileName: "demo.pdf",
      status: "done",
      updatedAt: Date.now(),
      pageCount: 5,
      metrics: {
        sourceWordCount: 500,
        outputWordCount: 500,
        outputPageCount: 5,
      },
    };

    render(<FidelityScoreCard session={session} />);

    expect(screen.getByText("Composite Fidelity Score")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();

    const dropdown = screen.getByTestId("fidelity-dropdown");
    expect(dropdown).toHaveClass("opacity-0");

    const card = screen.getByText("Composite Fidelity Score").closest(".group");
    expect(card).not.toBeNull();

    if (card) {
      fireEvent.mouseEnter(card);
      expect(dropdown).toHaveClass("opacity-100");

      fireEvent.mouseLeave(card);
      expect(dropdown).toHaveClass("opacity-0");
    }
  });

  it("closes dropdown on outside click, touchstart, or Escape key press", () => {
    const session: ConversionSession = {
      jobId: "job-3",
      fileName: "click_test.pdf",
      status: "done",
      updatedAt: Date.now(),
      metrics: { sourceWordCount: 100, outputWordCount: 100 },
    };

    render(
      <div>
        <div data-testid="outside">Outside Element</div>
        <FidelityScoreCard session={session} />
      </div>
    );

    const dropdown = screen.getByTestId("fidelity-dropdown");
    const card = screen.getByText("Composite Fidelity Score").closest(".group");

    if (card) {
      // Tap/click card to open
      fireEvent.click(card);
      expect(dropdown).toHaveClass("opacity-100");

      // Touch outside to close
      fireEvent.touchStart(screen.getByTestId("outside"));
      expect(dropdown).toHaveClass("opacity-0");

      // Tap/click card to open again
      fireEvent.click(card);
      expect(dropdown).toHaveClass("opacity-100");

      // Press Escape to close
      fireEvent.keyDown(document, { key: "Escape" });
      expect(dropdown).toHaveClass("opacity-0");
    }
  });
});
