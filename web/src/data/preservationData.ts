import {
    FileText,
    Type,
    Grid3x2,
    List,
    Bold,
    Image as ImageIcon,
    type LucideIcon,
} from "lucide-react";

export interface PreservationItem {
    id: number;
    title: string;
    category?: string;
    description: string;
    icon: LucideIcon;
    comparison: {
        original: string;
        result: string;
        description: string;
    };
}

export const preservationData: PreservationItem[] = [
    {
        id: 1,
        title: "Reading Order",
        category: "Layout Flow",
        description: "Rebuilds multi-column & asymmetric column flows naturally.",
        icon: FileText,
        comparison: {
            original: "Column Flow",
            result: "Contiguous Flow",
            description:
                "Multi-column geometry resolved into natural reading sequence.",
        },
    },
    {
        id: 2,
        title: "Headings & Paragraphs",
        category: "Typography",
        description:
            "Maps typography into native Word heading styles (H1–H4).",
        icon: Type,
        comparison: {
            original: "Visual Text",
            result: "Semantic Headings",
            description:
                "Native heading hierarchy enables Word Navigation Pane.",
        },
    },
    {
        id: 3,
        title: "Editable Data Tables",
        category: "Tables",
        description:
            "Converted to native Word tables with structured rows, columns, and borders.",
        icon: Grid3x2,
        comparison: {
            original: "Grid Lines & Text",
            result: "Native Word Table",
            description:
                "Structured rows, borders, and resizable cells preserved.",
        },
    },
    {
        id: 4,
        title: "Bulleted & Numbered Lists",
        category: "Hierarchy",
        description:
            "Recreates true hierarchical lists, not raw bullet characters.",
        icon: List,
        comparison: {
            original: "Raw Glyphs",
            result: "Word List Engine",
            description:
                "Hierarchical nesting and indentation preserved.",
        },
    },
    {
        id: 5,
        title: "Bold, Italic & Underline",
        category: "Formatting",
        description:
            "Character formatting and inline spans fully retained.",
        icon: Bold,
        comparison: {
            original: "Inline Spans",
            result: "100% Retained",
            description:
                "Weighted strokes and slanted emphasis cleanly separated.",
        },
    },
    {
        id: 6,
        title: "Embedded Images",
        category: "Media",
        description:
            "Preserved at native resolution in their exact reading context.",
        icon: ImageIcon,
        comparison: {
            original: "Raster & Vectors",
            result: "Lossless Extraction",
            description:
                "High-resolution images kept with original text wrapping.",
        },
    },
];