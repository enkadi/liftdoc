"""Raw page extraction with PyMuPDF: text lines, images, ruled tables, links, underlines."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

import pymupdf

log = logging.getLogger(__name__)

if hasattr(pymupdf, "no_recommend_layout"):
    pymupdf.no_recommend_layout()
pymupdf.TOOLS.mupdf_display_errors(False)
pymupdf.TOOLS.mupdf_display_warnings(False)

_FLAG_SUPERSCRIPT = 1
_FLAG_ITALIC = 2
_FLAG_BOLD = 16

TEXT_FLAGS = pymupdf.TEXTFLAGS_RAWDICT & ~pymupdf.TEXT_PRESERVE_LIGATURES
DOCX_IMAGE_EXTS = {"png", "jpeg", "jpg", "gif", "bmp", "tiff"}
MIN_IMAGE_SIDE = 6.0

BBox = tuple[float, float, float, float]


@dataclass(slots=True)
class Char:
    c: str
    x0: float
    x1: float


@dataclass(slots=True)
class Span:
    chars: list[Char]
    size: float
    font: str
    bold: bool
    italic: bool
    super_flag: bool
    color: int | None
    origin_y: float
    underline: bool = False
    link: str | None = None
    xref: int = 0  # PDF font object, for glyph-level repair
    visible: bool = True

    @property
    def text(self) -> str:
        return "".join(ch.c for ch in self.chars)

    @property
    def x0(self) -> float:
        return self.chars[0].x0

    @property
    def x1(self) -> float:
        return self.chars[-1].x1

    def clone(self, chars: list[Char]) -> Span:
        return Span(
            chars,
            self.size,
            self.font,
            self.bold,
            self.italic,
            self.super_flag,
            self.color,
            self.origin_y,
            self.underline,
            self.link,
            self.xref,
            self.visible,
        )


@dataclass(slots=True)
class Line:
    spans: list[Span]
    bbox: BBox
    block: int
    page: int

    @property
    def x0(self) -> float:
        return self.bbox[0]

    @property
    def y0(self) -> float:
        return self.bbox[1]

    @property
    def x1(self) -> float:
        return self.bbox[2]

    @property
    def y1(self) -> float:
        return self.bbox[3]

    @property
    def text(self) -> str:
        return "".join(s.text for s in self.spans)

    @property
    def size(self) -> float:
        """Dominant (character-weighted) font size of the line."""
        weights: dict[float, int] = {}
        for s in self.spans:
            n = len(s.text.strip())
            if n:
                weights[s.size] = weights.get(s.size, 0) + n
        if not weights:
            return self.spans[0].size
        return max(weights.items(), key=lambda kv: (kv[1], kv[0]))[0]

    @property
    def all_bold(self) -> bool:
        visible = [s for s in self.spans if s.text.strip()]
        return bool(visible) and all(s.bold for s in visible)

    @property
    def all_italic(self) -> bool:
        visible = [s for s in self.spans if s.text.strip()]
        return bool(visible) and all(s.italic for s in visible)


@dataclass(slots=True)
class RawImage:
    bbox: BBox
    data: bytes
    ext: str
    page: int
    full_page: bool = False


@dataclass(slots=True)
class RawRule:
    """A horizontal separator drawn on the page (not an underline, not a table border)."""

    bbox: BBox
    page: int


@dataclass(slots=True)
class RawCell:
    row: int
    col: int
    row_span: int
    col_span: int
    bbox: BBox
    spans: list[list[Span]] = field(default_factory=list)  # one entry per visual line


@dataclass(slots=True)
class RawTable:
    bbox: BBox
    n_rows: int
    n_cols: int
    col_edges: list[float]
    cells: list[RawCell]
    ruled: bool
    page: int
    row_edges: list[float] = field(default_factory=list)


@dataclass(slots=True)
class RawPage:
    index: int
    width: float
    height: float
    lines: list[Line]
    images: list[RawImage]
    tables: list[RawTable]
    word_count: int
    rules: list[RawRule] = field(default_factory=list)
    source_images: int = 0  # image placements on the PDF page, before any filtering


_SUBSET_PREFIX = re.compile(r"^[A-Z]{6}\+")
_STYLE_SUFFIX = re.compile(
    r"[-,]?(bold|italic|oblique|regular|roman|medium|semibold|demi|light|black|heavy|book|"
    r"boldmt|italicmt|bolditalic|boldoblique|mt|ps|psmt)+$",
    re.IGNORECASE,
)
_KNOWN_FAMILIES = (
    ("helvetica", "Arial"),
    ("arial", "Arial"),
    ("times", "Times New Roman"),
    ("courier", "Courier New"),
    ("dejavusansmono", "DejaVu Sans Mono"),
    ("dejavusans", "DejaVu Sans"),
    ("dejavuserif", "DejaVu Serif"),
    ("liberationsans", "Liberation Sans"),
    ("liberationserif", "Liberation Serif"),
    ("calibri", "Calibri"),
    ("cambria", "Cambria"),
    ("georgia", "Georgia"),
    ("verdana", "Verdana"),
    ("tahoma", "Tahoma"),
    ("symbol", "Symbol"),
)


def word_font_name(pdf_font: str) -> str:
    """Map a PDF font name to the closest font family Word is likely to have."""
    name = _SUBSET_PREFIX.sub("", pdf_font or "")
    compact = re.sub(r"[\s_-]", "", name).lower()
    for needle, family in _KNOWN_FAMILIES:
        if compact.startswith(needle):
            return family
    base = name
    for _ in range(3):
        base = _STYLE_SUFFIX.sub("", base)
    return base.strip(" -,") or "Arial"


def _font_is_bold(name: str) -> bool:
    low = name.lower()
    return any(k in low for k in ("bold", "black", "heavy", "semibold", "demi"))


def _font_is_italic(name: str) -> bool:
    low = name.lower()
    return "italic" in low or "oblique" in low


def count_words(tokens) -> int:
    """Count whitespace-delimited tokens that contain at least one letter or digit.

    Pure-symbol tokens (bullets, rules, dashes) are not words; using the same rule for the
    source PDF and the generated DOCX keeps the two counts comparable.
    """
    return sum(1 for t in tokens if any(ch.isalnum() for ch in t))


def _cluster(values: list[float], tol: float = 2.0) -> list[float]:
    out: list[list[float]] = []
    for v in sorted(values):
        if out and v - out[-1][-1] <= tol:
            out[-1].append(v)
        else:
            out.append([v])
    return [sum(g) / len(g) for g in out]


def _nearest(edges: list[float], v: float) -> int:
    return min(range(len(edges)), key=lambda i: abs(edges[i] - v))


def _build_lines(
    page_dict: dict, page_index: int, fonts: dict[str, int] | None = None
) -> tuple[list[Line], list[dict]]:
    fonts = fonts or {}
    lines: list[Line] = []
    image_blocks: list[dict] = []
    for block in page_dict.get("blocks", []):
        if block.get("type") == 1:
            image_blocks.append(block)
            continue
        for raw_line in block.get("lines", []):
            spans: list[Span] = []
            for raw in raw_line.get("spans", []):
                chars = [
                    Char(ch["c"], ch["bbox"][0], ch["bbox"][2]) for ch in raw.get("chars", []) if ch.get("c")
                ]
                if not chars:
                    continue
                flags = raw.get("flags", 0)
                font = raw.get("font", "")
                color = raw.get("color") or None
                spans.append(
                    Span(
                        chars=chars,
                        size=round(float(raw.get("size", 0.0)), 2),
                        font=font,
                        bold=bool(flags & _FLAG_BOLD) or _font_is_bold(font),
                        italic=bool(flags & _FLAG_ITALIC) or _font_is_italic(font),
                        super_flag=bool(flags & _FLAG_SUPERSCRIPT),
                        color=color,
                        origin_y=float(raw.get("origin", (0.0, raw["bbox"][3]))[1]),
                        xref=fonts.get(font, 0),
                        visible=raw.get("alpha", 255) != 0,
                    )
                )
            if not spans or not "".join(s.text for s in spans).strip():
                continue
            lines.append(Line(spans, tuple(raw_line["bbox"]), int(block.get("number", 0)), page_index))
    return lines, image_blocks


def _split_spans(line: Line, x0: float, x1: float, *, underline=False, link=None) -> None:
    """Apply an attribute to the characters of `line` whose centre lies in [x0, x1]."""
    out: list[Span] = []
    for span in line.spans:
        groups: list[tuple[bool, list[Char]]] = []
        for ch in span.chars:
            inside = x0 <= (ch.x0 + ch.x1) / 2 <= x1
            if groups and groups[-1][0] == inside:
                groups[-1][1].append(ch)
            else:
                groups.append((inside, [ch]))
        for inside, chars in groups:
            piece = span.clone(chars)
            if inside:
                if underline:
                    piece.underline = True
                if link:
                    piece.link = link
            out.append(piece)
    line.spans = out


def _drawings(page: pymupdf.Page) -> list[dict]:
    try:
        return page.get_drawings()
    except Exception:  # noqa: BLE001 - malformed vector content must not fail the page
        return []


def _horizontal_rules(drawings: list[dict]) -> list[tuple[float, float, float]]:
    """Thin horizontal strokes/rectangles as (x0, x1, y) — underline candidates."""
    rules: list[tuple[float, float, float]] = []
    for path in drawings:
        for item in path.get("items", []):
            if item[0] == "l":
                p1, p2 = item[1], item[2]
                if abs(p1.y - p2.y) < 0.6 and abs(p1.x - p2.x) > 2:
                    rules.append((min(p1.x, p2.x), max(p1.x, p2.x), (p1.y + p2.y) / 2))
            elif item[0] == "re":
                r = item[1]
                if r.height < 1.6 and r.width > 2:
                    rules.append((r.x0, r.x1, (r.y0 + r.y1) / 2))
    return rules


def _apply_underlines(lines: list[Line], rules: list[tuple[float, float, float]]) -> set[int]:
    """Mark underlined characters; return the indexes of the rules that were underlines."""
    used: set[int] = set()
    for index, (x0, x1, y) in enumerate(rules):
        for line in lines:
            if not (line.y0 < y <= line.y1 + 2):
                continue
            base = max(s.origin_y for s in line.spans)
            size = line.size
            if not (base - 0.5 <= y <= base + 0.3 * size):
                continue
            covered = sum(
                ch.x1 - ch.x0 for s in line.spans for ch in s.chars if x0 - 1 <= (ch.x0 + ch.x1) / 2 <= x1 + 1
            )
            # A rule much longer than the text above it is a separator, not an underline.
            if covered >= 0.7 * (x1 - x0):
                _split_spans(line, x0 - 1, x1 + 1, underline=True)
                used.add(index)
    return used


def _apply_links(page: pymupdf.Page, lines: list[Line]) -> None:
    try:
        links = page.get_links()
    except Exception:  # noqa: BLE001
        return
    for link in links:
        uri = link.get("uri")
        rect = link.get("from")
        if not uri or rect is None:
            continue
        for line in lines:
            mid = (line.y0 + line.y1) / 2
            if rect.y0 <= mid <= rect.y1 and line.x1 > rect.x0 and line.x0 < rect.x1:
                _split_spans(line, rect.x0 - 0.5, rect.x1 + 0.5, link=uri)


def _normalise_image(data: bytes, ext: str) -> tuple[bytes, str] | None:
    ext = (ext or "").lower()
    if ext in DOCX_IMAGE_EXTS:
        return data, "jpeg" if ext == "jpg" else ext
    try:
        pix = pymupdf.Pixmap(data)
        if pix.colorspace is not None and pix.colorspace.n > 3:
            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
        return pix.tobytes("png"), "png"
    except Exception:  # noqa: BLE001
        log.warning("Skipping image with unsupported encoding", extra={"ext": ext})
        return None


def _extract_images(
    image_blocks: list[dict], page: pymupdf.Page, page_index: int, ocr_layer: bool
) -> list[RawImage]:
    images: list[RawImage] = []
    page_area = page.rect.width * page.rect.height
    for block in image_blocks:
        rect = pymupdf.Rect(block["bbox"]) & page.rect
        if rect.is_empty or rect.width < MIN_IMAGE_SIDE or rect.height < MIN_IMAGE_SIDE:
            continue  # includes one-pixel images stretched into hairlines (see _hairline_rules)
        full_page = rect.width * rect.height >= 0.85 * page_area
        # A page-sized picture under an invisible (OCR) text layer is a scan: the text is
        # what the user wants to edit, so the backdrop is dropped. A cover or illustrated
        # page with visible text keeps its picture.
        if full_page and ocr_layer:
            continue
        normalised = _normalise_image(block.get("image") or b"", block.get("ext", ""))
        if normalised is None:
            continue
        data, ext = normalised
        images.append(RawImage((rect.x0, rect.y0, rect.x1, rect.y1), data, ext, page_index, full_page))
    return images


def table_from_grid(cell_boxes: list[BBox], bbox: BBox, page_index: int, *, ruled: bool) -> RawTable | None:
    """Build a table from cell rectangles, recovering row/column spans from the grid."""
    if not cell_boxes:
        return None
    xs = _cluster([v for b in cell_boxes for v in (b[0], b[2])])
    ys = _cluster([v for b in cell_boxes for v in (b[1], b[3])])
    n_cols, n_rows = len(xs) - 1, len(ys) - 1
    if n_cols < 1 or n_rows < 1:
        return None
    cells: list[RawCell] = []
    seen: set[tuple[int, int]] = set()
    for b in cell_boxes:
        c0, c1 = _nearest(xs, b[0]), _nearest(xs, b[2])
        r0, r1 = _nearest(ys, b[1]), _nearest(ys, b[3])
        if c1 <= c0 or r1 <= r0 or (r0, c0) in seen:
            continue
        seen.add((r0, c0))
        cells.append(RawCell(r0, c0, r1 - r0, c1 - c0, b))
    return RawTable(bbox, n_rows, n_cols, xs, cells, ruled, page_index, ys)


def _looks_like_cells(found) -> bool:
    """Guard for grids inferred from filled rectangles alone: highlighted running text
    produces a "table" of long, mostly empty cells."""
    try:
        cells = [c for row in found.extract() for c in row]
    except Exception:  # noqa: BLE001
        return False
    texts = [(c or "").strip() for c in cells]
    filled = [t for t in texts if t]
    if not filled or len(filled) < 0.75 * len(texts):
        return False
    lengths = sorted(len(t) for t in filled)
    return lengths[len(lengths) // 2] <= 30 and lengths[-1] <= 80


def _find_ruled_tables(page: pymupdf.Page, page_index: int, has_fills: bool = True) -> list[RawTable]:
    """Tables with drawn rules. Stroked grids are trusted; a grid that exists only as
    background fills must also read like a table."""
    try:
        found_tables = [(t, True) for t in page.find_tables(strategy="lines_strict").tables]
        if not found_tables and has_fills:
            found_tables = [(t, False) for t in page.find_tables().tables]
    except Exception:  # noqa: BLE001 - table detection is best effort
        log.warning("find_tables failed", extra={"page": page_index}, exc_info=True)
        return []
    tables: list[RawTable] = []
    for found, stroked in found_tables:
        if not stroked and not _looks_like_cells(found):
            continue
        boxes = [tuple(c) for c in found.cells if c is not None]
        table = table_from_grid(boxes, tuple(found.bbox), page_index, ruled=True)
        if table is None or table.n_rows * table.n_cols < 2:
            continue
        tables.append(table)
    return tables


def assign_lines_to_tables(lines: list[Line], tables: list[RawTable]) -> list[Line]:
    """Move text that lies inside a table into its cells; return the remaining lines."""
    if not tables:
        return lines
    remaining: list[Line] = []
    for line in sorted(lines, key=lambda ln: (ln.y0, ln.x0)):
        mid_y = (line.y0 + line.y1) / 2
        target = None
        for table in tables:
            x0, y0, x1, y1 = table.bbox
            if x0 - 1 <= (line.x0 + line.x1) / 2 <= x1 + 1 and y0 - 1 <= mid_y <= y1 + 1:
                target = table
                break
        if target is None:
            remaining.append(line)
            continue
        per_cell: dict[int, list[Span]] = {}
        for span in line.spans:
            mid_x = (span.x0 + span.x1) / 2
            best = None
            for idx, cell in enumerate(target.cells):
                cx0, cy0, cx1, cy1 = cell.bbox
                if cx0 - 0.5 <= mid_x <= cx1 + 0.5 and cy0 - 0.5 <= mid_y <= cy1 + 0.5:
                    best = idx
                    break
            if best is None:  # text overhanging the grid: keep it with the nearest cell
                best = min(
                    range(len(target.cells)),
                    key=lambda i: (
                        abs((target.cells[i].bbox[1] + target.cells[i].bbox[3]) / 2 - mid_y),
                        abs((target.cells[i].bbox[0] + target.cells[i].bbox[2]) / 2 - mid_x),
                    ),
                )
            per_cell.setdefault(best, []).append(span)
        for idx, spans in per_cell.items():
            target.cells[idx].spans.append(spans)
    return remaining


def _separators(
    rules: list[tuple[float, float, float]],
    underline_rules: set[int],
    tables: list[RawTable],
    page: pymupdf.Page,
    page_index: int,
) -> list[RawRule]:
    out: list[RawRule] = []
    for index, (x0, x1, y) in enumerate(rules):
        if index in underline_rules or x1 - x0 < 0.08 * page.rect.width:
            continue
        if any(
            t.bbox[0] - 2 <= x0 and x1 <= t.bbox[2] + 2 and t.bbox[1] - 2 <= y <= t.bbox[3] + 2
            for t in tables
        ):
            continue
        if any(abs(r.bbox[1] + 0.5 - y) < 1.5 and r.bbox[0] <= x1 and x0 <= r.bbox[2] for r in out):
            continue  # doubled stroke
        out.append(RawRule((x0, y - 0.5, x1, y + 0.5), page_index))
    return out


def _hairline_rules(image_blocks: list[dict]) -> list[tuple[float, float, float]]:
    """Some producers draw separator lines as a 1x1 image stretched to a hairline."""
    out = []
    for block in image_blocks:
        x0, y0, x1, y1 = block["bbox"]
        if y1 - y0 < 2.0 and x1 - x0 > 20:
            out.append((x0, x1, (y0 + y1) / 2))
    return out


def _is_big_enough(block: dict) -> bool:
    x0, y0, x1, y1 = block["bbox"]
    return x1 - x0 >= MIN_IMAGE_SIDE and y1 - y0 >= MIN_IMAGE_SIDE


def extract_page(page: pymupdf.Page, page_index: int, catalog=None) -> RawPage:
    page_dict = page.get_text("rawdict", flags=TEXT_FLAGS)
    fonts = catalog.page_fonts(page) if catalog is not None else None
    lines, image_blocks = _build_lines(page_dict, page_index, fonts)
    # counted the way the generated document is counted, so the two totals are comparable
    word_count = sum(count_words(ln.text.split()) for ln in lines)
    spans = [s for ln in lines for s in ln.spans]
    ocr_layer = bool(spans) and sum(1 for s in spans if not s.visible) >= 0.9 * len(spans)

    drawings = _drawings(page)
    has_fills = any(d.get("fill") is not None for d in drawings)
    tables = _find_ruled_tables(page, page_index, has_fills) if drawings else []
    tables = [t for t in tables if _table_has_text(t, lines)]
    lines = assign_lines_to_tables(lines, tables)

    rules = _horizontal_rules(drawings) + _hairline_rules(image_blocks)
    underline_rules = _apply_underlines(lines, rules) if rules else set()
    _apply_links(page, lines)

    return RawPage(
        index=page_index,
        width=page.rect.width,
        height=page.rect.height,
        lines=lines,
        images=_extract_images(image_blocks, page, page_index, ocr_layer),
        tables=tables,
        word_count=word_count,
        rules=_separators(rules, underline_rules, tables, page, page_index),
        source_images=sum(1 for b in image_blocks if _is_big_enough(b)),
    )


def _table_has_text(table: RawTable, lines: list[Line]) -> bool:
    x0, y0, x1, y1 = table.bbox
    return any(
        x0 - 1 <= (ln.x0 + ln.x1) / 2 <= x1 + 1 and y0 - 1 <= (ln.y0 + ln.y1) / 2 <= y1 + 1 for ln in lines
    )
