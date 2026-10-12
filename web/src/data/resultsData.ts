import {
    FileText,
    ListOrdered,
    ListX,
    Heading1,
    Table2,
    Bold,
    Image as ImageIcon,
    Type,
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
    {
        id: 5,
        title: "Character Formatting Preserved",
        description:
            "Preserved semibold weights, true italics, sub/superscript elements, and monospaced tabular figures.",
        icon: Bold,
        badge: "Exact Font Weight",
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
    {
        id: 4,
        label: "Items requiring review",
        value: 2,
        icon: ListX,
        note: "Actionable",
        highlight: true,
    },
];

// ── Summary Cards (bottom section) ──────────────────────────────────────────

export type SummaryCardVariant = "figures" | "typography" | "session";

export interface SummaryCardFile {
    name: string;
}

export interface SummaryCardMapping {
    from: string;
    to: string;
    matchLabel: string;
}

export interface SummaryCardItem {
    id: number;
    title: string;
    description: string;
    icon: LucideIcon;
    badge: string;
    variant: SummaryCardVariant;
    /** figures variant — list of file chip names */
    files?: SummaryCardFile[];
    /** how many extra files beyond the shown chips */
    extraFiles?: number;
    /** typography variant — font mapping row */
    mapping?: SummaryCardMapping;
    /** session variant — progress bar fill 0–100 */
    progress?: number;
}

export const summaryCards: SummaryCardItem[] = [
    {
        id: 1,
        title: "Extracted Figures",
        description:
            "Bitmaps normalized to lossless PNGs and embedded at original resolution in the Word ZIP archive.",
        icon: ImageIcon,
        badge: "7 Assets",
        variant: "figures",
        files: [
            { name: "fig_p2_rev_trend.png" },
            { name: "fig_p5_ebitda.png" },
        ],
        extraFiles: 5,
    },
    {
        id: 2,
        title: "Typography Mapping",
        description:
            "Source Helvetica Neue successfully mapped to Aptos and Calibri with zero character displacement.",
        icon: Type,
        badge: "Zero Missing",
        variant: "typography",
        mapping: {
            from: "Helvetica Neue",
            to: "Aptos",
            matchLabel: "Matched (100%)",
        },
    },
    {
        id: 3,
        title: "Secure Session Lifespan",
        description:
            "Temporary server conversion cache automatically purges after 30 minutes. No lingering artifacts stored.",
        icon: ShieldCheck,
        badge: "00:00",
        variant: "session",
        progress: 100,
    },
];
