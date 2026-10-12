import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChecklistCard } from "./ChecklistCard";
import { FileText } from "lucide-react";
import type { ChecklistItem } from "@/data/resultsData";

describe("ChecklistCard", () => {
    const mockItem: ChecklistItem = {
        id: 1,
        title: "Text Preserved",
        description: "Full body copy and headings extracted without glyph omission.",
        icon: FileText,
        badge: "18,490 Words",
    };

    it("renders item title, description, and badge", () => {
        render(<ChecklistCard item={mockItem} />);

        expect(screen.getByText("Text Preserved")).toBeInTheDocument();
        expect(
            screen.getByText("Full body copy and headings extracted without glyph omission."),
        ).toBeInTheDocument();
        expect(screen.getByText("18,490 Words")).toBeInTheDocument();
    });

    it("renders the check icon", () => {
        const { container } = render(<ChecklistCard item={mockItem} />);
        const checkIcon = container.querySelector("svg.lucide-check-circle-2");
        expect(checkIcon).toBeInTheDocument();
    });
});
