import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FileText } from "lucide-react";
import FileInfoCard from "./FileInfoCard";

describe("FileInfoCard", () => {
  it("renders the provided name and description", () => {
    render(
      <FileInfoCard
        icon={FileText}
        iconClassName="text-red-600"
        iconContainerClassName="bg-red-100"
        name="report.pdf"
        description="PDF Document • 1.2 MB"
      />,
    );

    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByText("PDF Document • 1.2 MB")).toBeInTheDocument();
  });

  it("falls back to default copy when name/description are omitted", () => {
    render(
      <FileInfoCard
        icon={FileText}
        iconClassName="text-red-600"
        iconContainerClassName="bg-red-100"
      />,
    );

    expect(screen.getByText("Untitled document")).toBeInTheDocument();
    expect(screen.getByText("No file selected")).toBeInTheDocument();
  });
});
