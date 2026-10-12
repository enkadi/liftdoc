import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Stepper, { type Step } from "./Stepper";

describe("Stepper", () => {
  const steps: Step[] = [
    {
      title: "Ingest",
      description: "Reading file",
      status: "complete",
      meta: "1.2s",
      tags: [{ label: "PDF/A-2b" }],
    },
    {
      title: "Analyze",
      description: "Finding tables",
      status: "loading",
      runningNote: "Running solver",
      progress: { label: "Table 1 of 2", percent: 40, note: "cells bounded" },
    },
    {
      title: "Package",
      description: "Writing docx",
      status: "pending",
      meta: "Queued",
    },
  ];

  it("renders a row per step with its title and description", () => {
    render(<Stepper steps={steps} />);

    expect(screen.getByText("Ingest")).toBeInTheDocument();
    expect(screen.getByText("Analyze")).toBeInTheDocument();
    expect(screen.getByText("Package")).toBeInTheDocument();
    expect(screen.getByText("Reading file")).toBeInTheDocument();
    expect(screen.getByText("Writing docx")).toBeInTheDocument();
  });

  it("shows meta pills and tags for completed/pending steps", () => {
    render(<Stepper steps={steps} />);

    expect(screen.getByText("1.2s")).toBeInTheDocument();
    expect(screen.getByText("Queued")).toBeInTheDocument();
    expect(screen.getByText("PDF/A-2b")).toBeInTheDocument();
  });

  it("expands the active (loading) step into a detail card with a progress panel", () => {
    render(<Stepper steps={steps} />);

    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Running solver")).toBeInTheDocument();
    expect(screen.getByText("Table 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("40% cells bounded")).toBeInTheDocument();
  });

  it("marks a cancelled step as such instead of in progress", () => {
    const cancelledSteps: Step[] = [
      { ...steps[1], status: "cancelled" },
    ];
    render(<Stepper steps={cancelledSteps} />);

    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.queryByText("In Progress")).not.toBeInTheDocument();
  });
});
