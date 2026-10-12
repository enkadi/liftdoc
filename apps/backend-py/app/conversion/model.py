"""Intermediate document model shared by structure recovery and DOCX generation."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(slots=True)
class Run:
    text: str
    bold: bool = False
    italic: bool = False
    underline: bool = False
    size: float | None = None
    font: str | None = None
    color: int | None = None
    superscript: bool = False
    subscript: bool = False
    link: str | None = None

    def same_format(self, other: Run) -> bool:
        return (
            self.bold == other.bold
            and self.italic == other.italic
            and self.underline == other.underline
            and self.size == other.size
            and self.font == other.font
            and self.color == other.color
            and self.superscript == other.superscript
            and self.subscript == other.subscript
            and self.link == other.link
        )


@dataclass(slots=True)
class Paragraph:
    runs: list[Run]
    kind: str = "body"  # body | title | heading | list | toc | caption | footnote | index
    level: int = 0  # heading level (1-3) or list nesting level (0-based)
    ordered: bool = False
    list_id: int | None = None
    align: str = "left"  # left | center | right | justify
    size: float = 0.0
    page_break_before: bool = False
    indent_left: float = 0.0  # points, relative to the page margin
    first_indent: float = 0.0  # first-line offset from indent_left (negative = hanging)
    space_before: float = 0.0
    line_pitch: float | None = None  # baseline-to-baseline distance in the source
    keep_with_next: bool = False
    anchors: list[Picture] = field(default_factory=list)  # floating pictures hosted here

    @property
    def text(self) -> str:
        return "".join(r.text for r in self.runs)


@dataclass(slots=True)
class Picture:
    data: bytes
    ext: str
    width: float  # points
    height: float  # points
    # Floating placement (layout-faithful mode): page coordinates in points.
    wrap: str = "inline"  # inline | square | topbottom | behind
    x: float = 0.0
    y: float = 0.0


@dataclass(slots=True)
class ImageRow:
    """One or more images that sit side by side in the source."""

    images: list[Picture]
    align: str = "left"
    page_break_before: bool = False
    indent_left: float = 0.0
    space_before: float = 0.0
    keep_with_next: bool = False


@dataclass(slots=True)
class Rule:
    """A horizontal separator line."""

    width: float
    indent_left: float = 0.0
    space_before: float = 0.0
    page_break_before: bool = False


@dataclass(slots=True)
class TableCell:
    runs: list[Run] = field(default_factory=list)
    row_span: int = 1
    col_span: int = 1

    @property
    def text(self) -> str:
        return "".join(r.text for r in self.runs).strip()


@dataclass(slots=True)
class Table:
    # rows[r][c] is None where the grid slot is covered by a merged neighbour.
    rows: list[list[TableCell | None]]
    col_widths: list[float]
    ruled: bool = True
    header_rows: int = 0
    align: str = "left"
    page_break_before: bool = False
    row_heights: list[float] = field(default_factory=list)  # points; empty = automatic

    @property
    def n_cols(self) -> int:
        return len(self.col_widths)


@dataclass(slots=True)
class ColumnMark:
    """Boundary of a multi-column zone: start (n columns), break (next column), end."""

    kind: str  # start | break | end
    gap: float = 18.0  # gutter width in points
    offset: float = 0.0  # distance between the left edges of the columns, when known
    count: int = 2
    page_break_before: bool = False


Block = Paragraph | ImageRow | Table | Rule | ColumnMark


@dataclass(slots=True)
class ListInfo:
    list_id: int
    ordered: bool  # kind of the top level
    # per nesting level: (ordered, number format, start value, suffix)
    levels: dict[int, tuple[bool, str, int, str]] = field(default_factory=dict)


@dataclass(slots=True)
class Section:
    width: float
    height: float
    margin_left: float
    margin_right: float
    margin_top: float
    margin_bottom: float
    blocks: list[Block] = field(default_factory=list)


@dataclass(slots=True)
class HeadingStyle:
    size: float
    bold: bool
    italic: bool


@dataclass(slots=True)
class DocumentModel:
    sections: list[Section] = field(default_factory=list)
    lists: dict[int, ListInfo] = field(default_factory=dict)
    header: list[Run] = field(default_factory=list)
    # footer text split around the page number, when one was recognised
    footer: list[Run] = field(default_factory=list)
    footer_page_field: tuple[str, str] | None = None
    body_font: str = "Arial"
    body_size: float = 11.0
    line_pitch: float | None = None
    paragraph_gap: float = 6.0
    layout_mode: str = "faithful"  # faithful (page boundaries kept) | flow (reflowable)
    page_count: int = 0
    images_in_source: int = 0
    text_quality: object | None = None  # text_repair.TextQuality
    title_style: HeadingStyle | None = None
    heading_styles: dict[int, HeadingStyle] = field(default_factory=dict)

    # detection statistics (what was found in the source)
    multi_column_pages: int = 0
    tables_detected: int = 0
    images_detected: int = 0
    heading_counts: dict[int, int] = field(default_factory=dict)
    ordered_lists: int = 0
    unordered_lists: int = 0

    def iter_blocks(self):
        for section in self.sections:
            yield from section.blocks
