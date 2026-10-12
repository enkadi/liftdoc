import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FidelityMetricCard } from "./FidelityMetricCard";
import { Layers } from "lucide-react";
import type { FidelityMetric } from "@/data/resultsData";

describe("FidelityMetricCard", () => {
    const defaultItem: FidelityMetric = {
        id: 1,
        label: "Layout Parity",
        value: "99.4%",
        icon: Layers,
    };

    it("renders label, value, and icon", () => {
        const { container } = render(<FidelityMetricCard item={defaultItem} />);

        expect(screen.getByText("Layout Parity")).toBeInTheDocument();
        expect(screen.getByText("99.4%")).toBeInTheDocument();
        expect(container.querySelector("svg.lucide-layers")).toBeInTheDocument();
        expect(screen.queryByText("Adjusted")).not.toBeInTheDocument();
    });

    it("renders note when provided", () => {
        const itemWithNote: FidelityMetric = {
            ...defaultItem,
            note: "Standard Margin",
        };

        render(<FidelityMetricCard item={itemWithNote} />);
        expect(screen.getByText("Standard Margin")).toBeInTheDocument();
    });

    it("applies highlight styling when highlight is true", () => {
        const highlightedItem: FidelityMetric = {
            ...defaultItem,
            note: "1 Spacing Adjustment",
            highlight: true,
        };

        const { container } = render(<FidelityMetricCard item={highlightedItem} />);

        const card = container.firstChild as HTMLElement;
        expect(card.className).toContain("bg-info");

        const noteBadge = screen.getByText("1 Spacing Adjustment");
        expect(noteBadge.className).toContain("bg-info");
        expect(noteBadge.className).toContain("text-info-foreground");
    });

    it("does not apply highlight styling when highlight is falsy", () => {
        const { container } = render(<FidelityMetricCard item={defaultItem} />);

        const card = container.firstChild as HTMLElement;
        expect(card.className).not.toContain("bg-info");
    });
});
