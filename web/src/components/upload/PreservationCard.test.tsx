import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FileText } from "lucide-react";
import PreservationCard from "./PreservationCard";
import type { PreservationItem } from "@/data/preservationData";

const item: PreservationItem = {
  id: 1,
  title: "Reading Order",
  description: "Rebuilds multi-column flows naturally.",
  icon: FileText,
  comparison: {
    original: "Column Flow",
    result: "Contiguous Flow",
    description: "Rebuilds multi-column & asymmetric column flows naturally.",
  },
};

describe("PreservationCard", () => {
  it("renders the item's title, description, and comparison details", () => {
    render(<PreservationCard item={item} />);

    expect(screen.getByText("Reading Order")).toBeInTheDocument();
    expect(
      screen.getByText("Rebuilds multi-column flows naturally."),
    ).toBeInTheDocument();
    expect(screen.getByText("Column Flow")).toBeInTheDocument();
    expect(screen.getByText("Contiguous Flow")).toBeInTheDocument();
    expect(
      screen.getByText("Rebuilds multi-column & asymmetric column flows naturally."),
    ).toBeInTheDocument();
  });
});
