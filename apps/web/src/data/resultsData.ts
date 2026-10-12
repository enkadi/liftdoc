import {
    FileText,
    ListOrdered,
    Heading1,
    Table2,
    Image as ImageIcon,
    ShieldCheck,
    type LucideIcon,
} from "lucide-react";

export interface ChecklistItem {
    id: number;
    title: string;
    description: string;
    icon: LucideIcon;
    badge: string;
}

export interface FidelityMetric {
    id: number;
    label: string;
    value: string | number;
    icon: LucideIcon;
    note?: string;
    highlight?: boolean;
}

export const checklistData: ChecklistItem[] = [
    {
        id: 1,
        title: "Text Preserved",
        description:
            "Full body copy, footnotes, running headers, and multi-line callouts extracted without glyph omission.",
        icon: FileText,
        badge: "18,490 Words",
    },
    {
        id: 2,
        title: "Reading Order Reconstructed",
        description:
            "Multi-column financial sections split and sequence-linked into standard linear Word text stories.",
        icon: ListOrdered,
        badge: "Top-to-bottom XY-Cut",
    },
    {
        id: 3,
        title: "Headings Detected & Mapped",
        description:
            "Tagged directly into native Word Navigation Pane styles rather than faux-bold body runs.",
        icon: Heading1,
        badge: "H1, H2, H3 Registered",
    },
    {
        id: 4,
        title: "Lists Reconstructed as True Word Lists",
        description:
            "Converted floating bullet Unicode characters into auto-incrementing numbered & bulleted lists.",
        icon: ListOrdered,
        badge: "0 Lists",
    },
];

export const fidelityMetrics: FidelityMetric[] = [
    {
        id: 1,
        label: "Headings detected",
        value: 12,
        icon: Heading1,
        note: "100% mapped",
    },
    {
        id: 2,
        label: "Tables detected & rebuilt",
        value: 4,
        icon: Table2,
        note: "4 complex grids",
    },
    {
        id: 3,
        label: "Images & charts extracted",
        value: 7,
        icon: ImageIcon,
        note: "Lossless embed",
    },
];

// ── Summary Cards (bottom section) ──────────────────────────────────────────

export type SummaryCardVariant = "figures" | "session" | "lists";

export interface SummaryCardItem {
    id: number;
    title: string;
    description: string;
    icon: LucideIcon;
    badge: string;
    variant: SummaryCardVariant;
    detectedLists?: number;
    reconstructedLists?: number;
    detectedListsDetail?: string;
    reconstructedListsDetail?: string;
    progress?: number;
}

export const summaryCards: SummaryCardItem[] = [
    {
        id: 1,
        title: "Extracted Figures",
        description:
            "Bitmaps normalized to lossless PNGs and embedded at original resolution in the Word ZIP archive.",
        icon: ImageIcon,
        badge: "0 Assets",
        variant: "figures",
    },
    {
        id: 2,
        title: "List Reconstruction",
        description:
            "Converted floating bullet and numeric characters into native Word list structures.",
        icon: ListOrdered,
        badge: "0 Lists",
        variant: "lists",
    },
    {
        id: 3,
        title: "Secure Session Lifespan",
        description:
            "Temporary server conversion cache automatically purges after 30 minutes.",
        icon: ShieldCheck,
        badge: "00:00",
        variant: "session",
        progress: 100,
    },
];
