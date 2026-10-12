import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { SummaryCard } from "./SummaryCard";
import { Image as ImageIcon, ShieldCheck, ListOrdered } from "lucide-react";
import type { SummaryCardItem } from "@/data/resultsData";

describe("SummaryCard", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("renders common content: title, badge, description, and icon", () => {
        const item: SummaryCardItem = {
            id: 1,
            title: "Base Summary",
            description: "Base description text.",
            icon: ShieldCheck,
            badge: "Active",
            variant: "session",
        };

        const { container } = render(<SummaryCard item={item} />);

        expect(screen.getByText("Base Summary")).toBeInTheDocument();
        expect(screen.getByText("Active")).toBeInTheDocument();
        expect(screen.getByText("Base description text.")).toBeInTheDocument();
        expect(container.querySelector("svg.lucide-shield-check")).toBeInTheDocument();
    });

    it("renders figures variant with embedded assets indicator", () => {
        const item: SummaryCardItem = {
            id: 2,
            title: "Extracted Figures",
            description: "PNG & vector assets separated.",
            icon: ImageIcon,
            badge: "4 Assets",
            variant: "figures",
        };

        render(<SummaryCard item={item} />);

        expect(screen.getByText("Embedded Assets")).toBeInTheDocument();
        expect(screen.getByText("Lossless PNG")).toBeInTheDocument();
    });

    it("renders lists variant with detected and reconstructed lists breakdown", () => {
        const item: SummaryCardItem = {
            id: 6,
            title: "List Reconstruction",
            description: "Lists reconstructed.",
            icon: ListOrdered,
            badge: "3 Lists",
            variant: "lists",
            detectedLists: 3,
            reconstructedLists: 3,
            detectedListsDetail: "1 ordered & 2 unordered",
            reconstructedListsDetail: "1 ordered & 2 unordered",
        };

        render(<SummaryCard item={item} />);

        expect(screen.getByText("Detected Lists")).toBeInTheDocument();
        expect(screen.getByText("Reconstructed")).toBeInTheDocument();
        expect(screen.getAllByText("1 ordered & 2 unordered")).toHaveLength(2);
    });

    it("renders session variant with progress bar width percentage", () => {
        const item: SummaryCardItem = {
            id: 4,
            title: "Session Storage",
            description: "Storage allocation.",
            icon: ShieldCheck,
            badge: "4.2 MB / 50 MB",
            variant: "session",
            progress: 65,
        };

        const { container } = render(<SummaryCard item={item} />);

        const progressBar = container.querySelector('div[style*="width: 65%"]');
        expect(progressBar).toBeInTheDocument();
    });

    it("counts down the purge timer from completedAt", () => {
        vi.useFakeTimers();
        const completedAt = new Date("2026-01-01T00:00:00Z").getTime();
        vi.setSystemTime(completedAt + 15 * 60 * 1000);

        const item: SummaryCardItem = {
            id: 5,
            title: "Secure Session Lifespan",
            description: "Cache purges after 30 minutes.",
            icon: ShieldCheck,
            badge: "00:00",
            variant: "session",
            progress: 100,
        };

        const { container } = render(<SummaryCard item={item} completedAt={completedAt} />);

        expect(screen.getAllByText("15:00")).toHaveLength(2);
        expect(screen.getByText("Auto-purges in 15m")).toBeInTheDocument();
        expect(container.querySelector('div[style*="width: 50%"]')).toBeInTheDocument();

        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(screen.getAllByText("14:59")).toHaveLength(2);

        act(() => {
            vi.advanceTimersByTime(45 * 60 * 1000);
        });
        expect(screen.getByText("Purged")).toBeInTheDocument();
        expect(container.querySelector('div[style*="width: 0%"]')).toBeInTheDocument();
    });
});
