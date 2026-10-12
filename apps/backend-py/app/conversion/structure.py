"""Structure recovery: furniture, paragraphs, headings, lists, borderless tables, sections."""

from __future__ import annotations

import logging
import re
import statistics
from collections.abc import Callable
from dataclasses import dataclass, field

import pymupdf

from . import semantics
from .extract import Line, RawCell, RawImage, RawPage, RawRule, RawTable, Span, word_font_name
from .layout import split_columns
from .model import (
    ColumnMark,
    DocumentModel,
    HeadingStyle,
    ImageRow,
    ListInfo,
    Paragraph,
    Picture,
    Rule,
    Run,
    Section,
    Table,
    TableCell,
)
from .paragraphs import LeafContext, ParaGeometry, describe, reference_pitches, split_rows

log = logging.getLogger(__name__)

BULLETS = "•◦▪▫‣⁃∙○●■□◆◇➢➤►▶✓✔❖·"
WEAK_BULLETS = "-–—*"
_MARKER_SEG_RE = re.compile(r"^\(?(\d{1,3}|[A-Za-z]|[ivxIVX]{1,5})([.)])$")
_BARE_NUMBER_RE = re.compile(r"^\d{1,3}$")
_INLINE_MARKER_RE = re.compile(r"^(\(?(\d{1,3}|[A-Za-z]|[ivxIVX]{1,5})([.)]))(\s+)\S")
_PAGE_NUMBER_RE = re.compile(r"^(?:page\s+)?\d+(?:\s*(?:of|/)\s*\d+)?$|^[-–—]\s*\d+\s*[-–—]$", re.I)
_SENTENCE_END = (".", "!", "?", ":", ";")
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f￾￿\ud800-\udfff]")

HEADING_SIZE_RATIO = 1.12
_CHAPTER_RE = re.compile(
    r"^(chapter|part|book|section|appendix|prologue|epilogue|introduction|preface|foreword|afterword)"
    r"(\s+([0-9]+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b.*)?$",
    re.I,
)
MAX_LIST_LEVEL = 8


# --------------------------------------------------------------------------- rows


@dataclass(slots=True)
class Marker:
    ordered: bool
    strong: bool  # unambiguous on its own; weak markers need a neighbouring item
    marker_x: float
    text_x: float
    fmt: str = "bullet"
    number: int = 0
    suffix: str = "."
    inline_chars: int = 0  # characters to strip when the marker shares a span with the text


@dataclass(slots=True)
class Row:
    """Text segments sharing one baseline (PyMuPDF splits a line at wide gaps)."""

    segs: list[Line]
    marker: Marker | None = None

    @property
    def entry(self) -> bool:
        """A contents-style row: title, leader dots or a wide gap, then a page number."""
        text = self.text.strip()
        if semantics.LEADER_RE.match(text):
            return True
        if len(self.segs) >= 2:
            last = self.segs[-1].text.strip()
            gap = self.segs[-1].x0 - self.segs[-2].x1
            return gap >= 10 and bool(re.fullmatch(r"\d{1,4}|[ivxlcdm]{1,7}", last, re.I))
        return False

    @property
    def baseline(self) -> float:
        """Baseline of the dominant text (robust against super/subscripts and drop caps)."""
        size = self.size
        ys = [
            s.origin_y for seg in self.segs for s in seg.spans if abs(s.size - size) <= 0.3 and s.text.strip()
        ]
        return statistics.median(ys) if ys else self.y1

    @property
    def bbox(self):
        return (
            min(s.x0 for s in self.segs),
            min(s.y0 for s in self.segs),
            max(s.x1 for s in self.segs),
            max(s.y1 for s in self.segs),
        )

    @property
    def x0(self) -> float:
        return self.segs[0].x0

    @property
    def x1(self) -> float:
        return max(s.x1 for s in self.segs)

    @property
    def y0(self) -> float:
        return min(s.y0 for s in self.segs)

    @property
    def y1(self) -> float:
        return max(s.y1 for s in self.segs)

    @property
    def block(self) -> int:
        return self.segs[0].block

    @property
    def text(self) -> str:
        return " ".join(s.text.strip() for s in self.segs)

    @property
    def size(self) -> float:
        return max(self.segs, key=lambda s: len(s.text.strip())).size

    @property
    def all_bold(self) -> bool:
        return all(s.all_bold for s in self.segs)

    @property
    def all_italic(self) -> bool:
        return all(s.all_italic for s in self.segs)


@dataclass(slots=True)
class Para:
    rows: list[Row]
    page: int
    leaf: int
    marker: Marker | None = None
    kind: str = "body"
    level: int = 0
    list_id: int | None = None
    align: str = "left"
    hint: str = ""  # toc | index | caption | footnote
    geo: ParaGeometry | None = None
    ctx_left: float = 0.0  # left edge the indents are measured from
    multi: bool = False  # belongs to a column of a multi-column page
    space_before: float = 0.0
    base_gap: float | None = None  # baseline distance to the paragraph above
    top_y: float | None = None  # set for the first block of a column/page

    @property
    def text(self) -> str:
        return " ".join(r.text for r in self.rows)

    @property
    def size(self) -> float:
        return self.rows[0].size

    @property
    def all_bold(self) -> bool:
        return all(r.all_bold for r in self.rows)

    @property
    def all_italic(self) -> bool:
        return all(r.all_italic for r in self.rows)


@dataclass(slots=True)
class Entry:
    """A block in document flow plus the provenance needed for cross-page decisions."""

    block: object
    page: int
    leaf: int
    last_row_full: bool = True
    meta: dict = field(default_factory=dict)


def _roman(text: str) -> int:
    values = {"i": 1, "v": 5, "x": 10}
    total, prev = 0, 0
    for ch in reversed(text.lower()):
        v = values.get(ch, 0)
        total += -v if v < prev else v
        prev = max(prev, v)
    return total


def _parse_number(token: str) -> tuple[str, int]:
    if token.isdigit():
        return "decimal", int(token)
    if len(token) == 1 and token not in "iI":
        return ("lowerLetter" if token.islower() else "upperLetter"), ord(token.lower()) - 96
    return ("lowerRoman" if token.islower() else "upperRoman"), _roman(token)


def detect_marker(row: Row, body_size: float) -> Marker | None:
    """Recognise a bullet or number glyph at the start of a row."""
    if row.size >= HEADING_SIZE_RATIO * body_size:
        return None  # "1. Overview" in a heading font is a numbered heading, not a list item
    first_seg = row.segs[0]
    first = first_seg.text.strip()
    if not first:
        return None
    if len(row.segs) >= 2:
        nxt = row.segs[1]
        gap = nxt.x0 - first_seg.x1
        if len(first) == 1 and first in BULLETS + WEAK_BULLETS:
            return Marker(False, True, first_seg.x0, nxt.x0)
        m = _MARKER_SEG_RE.match(first)
        if m and gap <= 40:
            fmt, number = _parse_number(m.group(1))
            return Marker(True, True, first_seg.x0, nxt.x0, fmt, number, m.group(2))
        if _BARE_NUMBER_RE.match(first) and len(row.segs) == 2 and gap <= 30:
            return Marker(True, False, first_seg.x0, nxt.x0, "decimal", int(first), ".")
        return None
    if len(first) < 3:
        return None
    lead = len(first_seg.text) - len(first_seg.text.lstrip())
    chars = [ch for s in first_seg.spans for ch in s.chars]

    def text_x(n: int) -> float:
        return chars[n].x0 if n < len(chars) else first_seg.x0

    if first[0] in BULLETS + WEAK_BULLETS and first[1].isspace():
        strip = lead + 1 + (len(first[1:]) - len(first[1:].lstrip()))
        return Marker(False, first[0] in BULLETS, first_seg.x0, text_x(strip), inline_chars=strip)
    if row.all_bold:
        return None  # bold "1. Introduction" at body size is a heading candidate
    m = _INLINE_MARKER_RE.match(first)
    if m:
        fmt, number = _parse_number(m.group(2))
        strip = lead + len(m.group(1)) + len(m.group(4))
        return Marker(True, False, first_seg.x0, text_x(strip), fmt, number, m.group(3), inline_chars=strip)
    return None


def _is_raised_mark(row: Row, line: Line) -> bool:
    text = line.text.strip()
    if len(text) > 3 or line.size >= 0.8 * row.size:
        return False
    overlap = min(row.y1, line.y1) - max(row.y0, line.y0)
    return overlap >= 0.5 * (line.y1 - line.y0) and row.x0 - 1 <= line.x0 <= row.x1 + 0.5 * row.size


def group_rows(leaf: list, body_size: float) -> list:
    """Merge consecutive same-baseline lines of a leaf into rows; pass other elements through."""
    out: list = []
    for e in leaf:
        if isinstance(e, Line):
            prev = out[-1] if out else None
            if isinstance(prev, Row):
                ref = prev.segs[0]
                yc, ref_c = (e.y0 + e.y1) / 2, (ref.y0 + ref.y1) / 2
                if ref.y0 <= yc <= ref.y1 and e.y0 <= ref_c <= e.y1 and e.x0 >= prev.x1 - 1:
                    prev.segs.append(e)
                    continue
            if isinstance(prev, Row) and _is_raised_mark(prev, e):
                # a footnote reference set as its own tiny line belongs to the line it sits on
                prev.segs.append(e)
                prev.segs.sort(key=lambda s: s.x0)
                continue
            out.append(Row([e]))
        else:
            out.append(e)
    for item in out:
        if isinstance(item, Row):
            item.marker = detect_marker(item, body_size)
    return out


# --------------------------------------------------------------- borderless tables


def _is_table_row(row) -> bool:
    if not isinstance(row, Row) or len(row.segs) < 2 or row.marker is not None or row.entry:
        return False
    return all(b.x0 - a.x1 >= 10 for a, b in zip(row.segs, row.segs[1:]))


def _aligned(a: Line, b: Line, tol: float = 4.0) -> bool:
    return abs(a.x0 - b.x0) <= tol or abs(a.x1 - b.x1) <= tol or abs((a.x0 + a.x1) - (b.x0 + b.x1)) / 2 <= tol


def _column_is_prose(rows: list[Row], col: int) -> bool:
    """True when a candidate column reads as wrapped running text rather than cells."""
    cells = [r.segs[col] for r in rows]
    right = max(c.x1 for c in cells)
    wraps = 0
    for a, b in zip(cells, cells[1:]):
        chars = [ch for s in b.spans for ch in s.chars]
        first_word = next((ch.x0 for ch in chars if ch.c.isspace()), b.x1) - b.x0
        if a.x1 + 0.25 * a.size + first_word >= right - 1.0:
            wraps += 1
    lengths = sorted(len(c.text.strip()) for c in cells)
    median = lengths[len(lengths) // 2]
    if median > 20 and wraps >= 0.5 * (len(cells) - 1):
        return True
    # table cells are short; a column of sentence-length lines is prose even when ragged
    return median > 45


def _rows_compatible(a: Row, b: Row) -> bool:
    if len(a.segs) != len(b.segs):
        return False
    if b.y0 - a.y1 > 2.5 * (a.y1 - a.y0):
        return False
    return all(_aligned(x, y) for x, y in zip(a.segs, b.segs))


def _build_borderless(rows: list[Row], page: pymupdf.Page | None, page_index: int) -> RawTable:
    n_cols = len(rows[0].segs)
    col_x0 = [min(r.segs[c].x0 for r in rows) for c in range(n_cols)]
    col_x1 = [max(r.segs[c].x1 for r in rows) for c in range(n_cols)]
    xs = [col_x0[0] - 2.0]
    xs += [(col_x1[c] + col_x0[c + 1]) / 2 for c in range(n_cols - 1)]
    xs.append(col_x1[-1] + 2.0)
    ys = [rows[0].y0 - 1.0]
    ys += [(rows[i].y1 + rows[i + 1].y0) / 2 for i in range(len(rows) - 1)]
    ys.append(rows[-1].y1 + 1.0)
    bbox = (xs[0], ys[0], xs[-1], ys[-1])

    if page is not None:
        # Let PyMuPDF confirm the whitespace-aligned grid from the inferred boundaries.
        try:
            found = page.find_tables(
                clip=pymupdf.Rect(bbox),
                vertical_strategy="explicit",
                horizontal_strategy="explicit",
                vertical_lines=xs,
                horizontal_lines=ys,
            ).tables
            if len(found) != 1 or (found[0].row_count, found[0].col_count) != (len(rows), n_cols):
                log.debug("Borderless table grid not confirmed by find_tables")
        except Exception:  # noqa: BLE001
            log.debug("find_tables failed on borderless candidate", exc_info=True)

    cells = [
        RawCell(r, c, 1, 1, (xs[c], ys[r], xs[c + 1], ys[r + 1]), [list(row.segs[c].spans)])
        for r, row in enumerate(rows)
        for c in range(n_cols)
    ]
    return RawTable(bbox, len(rows), n_cols, xs, cells, ruled=False, page=page_index, row_edges=ys)


def detect_borderless_tables(items: list, page: pymupdf.Page | None, page_index: int) -> list:
    """Replace runs of column-aligned multi-segment rows with whitespace-aligned tables."""
    out: list = []
    i = 0
    while i < len(items):
        if _is_table_row(items[i]):
            j = i + 1
            while j < len(items) and _is_table_row(items[j]) and _rows_compatible(items[j - 1], items[j]):
                j += 1
            rows = items[i:j]
            prose = j - i >= 2 and any(_column_is_prose(rows, c) for c in range(len(rows[0].segs)))
            if j - i >= 2 and prose:
                # Running text set beside margin notes or captions, not a table: read each
                # column on its own instead of pairing unrelated lines across the gap.
                for c in range(len(rows[0].segs)):
                    out.extend(Row([r.segs[c]]) for r in rows)
                i = j
                continue
            if j - i >= 2:
                out.append(_build_borderless(items[i:j], page, page_index))
                i = j
                continue
        out.append(items[i])
        i += 1
    return out


# ------------------------------------------------------------------- paragraphs


def _entry_rows(rows: list[Row]) -> list[list[Row]]:
    """Index-style entries: one paragraph per line, deeper-indented lines continue the entry."""
    out: list[list[Row]] = []
    for row in rows:
        if out and row.x0 > out[-1][0].x0 + 3 and row.y0 - out[-1][-1].y0 <= 2.2 * row.size:
            out[-1].append(row)
        else:
            out.append([row])
    return out


def build_paragraphs(
    items: list,
    page: int,
    leaf: int,
    body_size: float,
    ctx: LeafContext | None = None,
    multi: bool = False,
    entries: bool = False,
) -> list:
    """Turn the rows of one column into paragraphs (see paragraphs.py); pass other items through."""
    rows_all = [it for it in items if isinstance(it, Row)]
    if ctx is None and rows_all:
        ctx = LeafContext(min(r.x0 for r in rows_all), max(r.x1 for r in rows_all), body_size)
    pitches = reference_pitches(rows_all)
    out: list = []
    pending: list[Row] = []
    cur: Para | None = None  # open list item

    def make(rows: list[Row], marker: Marker | None = None) -> Para:
        para = Para(rows, page, leaf, marker=marker, multi=multi, ctx_left=ctx.left)
        para.geo = describe(rows, ctx)
        para.align = "left" if marker is not None else para.geo.align
        return para

    def flush() -> None:
        nonlocal cur, pending
        if cur is not None:
            out.append(make(cur.rows, cur.marker))
            cur = None
        for rows in _entry_rows(pending) if entries else split_rows(pending, ctx, pitches):
            out.append(make(rows))
        pending = []

    for item in items:
        if not isinstance(item, Row):
            flush()
            out.append(item)
            continue
        row = item
        if row.marker is not None:
            flush()
            cur = Para([row], page, leaf, marker=row.marker)
            continue
        if cur is not None:
            prev = cur.rows[-1]
            near = -1 <= row.y0 - prev.y0 <= 2.2 * max(prev.size, row.size) + 2
            same_size = abs(row.size - prev.size) <= 0.6
            indent = cur.marker.marker_x if cur.marker.inline_chars else cur.marker.text_x
            if (
                near
                and same_size
                and row.x0 >= indent - 3
                and (row.block == prev.block or not cur.marker.inline_chars)
            ):
                cur.rows.append(row)
                continue
            flush()
        pending.append(row)
    flush()

    # vertical position: distance to whatever precedes each block in the column
    prev = None
    for item in out:
        if isinstance(item, Para):
            first = item.rows[0]
            if prev is None:
                item.top_y = first.y0
            elif isinstance(prev, Para):
                # turned into space-before once the paragraph's line height is known
                item.base_gap = first.baseline - prev.rows[-1].baseline
            else:
                item.space_before = max(0.0, min(first.y0 - prev.bbox[3], 240.0))
        prev = item
    return out


def _spans_to_runs(spans: list[Span]) -> list[Run]:
    weights: dict[float, int] = {}
    for s in spans:
        weights[s.size] = weights.get(s.size, 0) + len(s.text.strip())
    dom = max(weights.items(), key=lambda kv: (kv[1], kv[0]))[0] if weights else 0.0
    origins = [s.origin_y for s in spans if s.size == dom]
    base = statistics.median(origins) if origins else 0.0
    runs: list[Run] = []
    for s in spans:
        text = s.text
        if not text:
            continue
        sup = sub = False
        size = s.size
        if text.strip() and dom and s.size < 0.9 * dom:
            dy = s.origin_y - base
            if s.super_flag or dy < -0.08 * dom:
                sup = True
            elif dy > 0.08 * dom:
                sub = True
            if sup or sub:
                size = dom  # Word shrinks sub/superscripts itself
        runs.append(
            Run(
                text,
                s.bold,
                s.italic,
                s.underline,
                size,
                word_font_name(s.font),
                s.color,
                sup,
                sub,
                s.link,
            )
        )
    return runs


def normalise_runs(runs: list[Run]) -> list[Run]:
    out: list[Run] = []
    for run in runs:
        text = _CONTROL_CHARS.sub("", run.text.replace("\n", " ").replace("\r", " "))
        text = text.replace("­", "")
        if not text:
            continue
        if out and (out[-1].same_format(run) or not text.strip()):
            out[-1].text += text
        else:
            out.append(
                Run(
                    text,
                    run.bold,
                    run.italic,
                    run.underline,
                    run.size,
                    run.font,
                    run.color,
                    run.superscript,
                    run.subscript,
                    run.link,
                )
            )
    # collapse runs of spaces, including across run boundaries
    prev_space = True
    for run in out:
        chars = []
        for ch in run.text:
            is_space = ch == " "
            if is_space and prev_space:
                continue
            chars.append(ch)
            prev_space = is_space
        run.text = "".join(chars)
    out = [r for r in out if r.text]
    if out:
        out[-1].text = out[-1].text.rstrip(" ")
        if not out[-1].text:
            out.pop()
    return out


def _strip_prefix(runs: list[Run], n: int) -> None:
    for run in runs:
        if n <= 0:
            break
        take = min(n, len(run.text))
        run.text = run.text[take:]
        n -= take


def rows_to_runs(rows: list[Row], marker: Marker | None = None) -> list[Run]:
    runs: list[Run] = []
    for ri, row in enumerate(rows):
        segs = row.segs
        if ri == 0 and marker is not None and not marker.inline_chars:
            segs = segs[1:]
        row_runs: list[Run] = []
        for si, seg in enumerate(segs):
            if si:
                gap = seg.x0 - segs[si - 1].x1
                row_runs.append(Run("\t" if gap > 2.5 * seg.size else " "))
            row_runs.extend(_spans_to_runs(seg.spans))
        if ri == 0 and marker is not None and marker.inline_chars:
            _strip_prefix(row_runs, marker.inline_chars)
        if runs and row_runs:
            prev_text = "".join(r.text for r in runs).rstrip()
            next_text = "".join(r.text for r in row_runs).lstrip()
            hyphen_join = (
                len(prev_text) > 2
                and prev_text.endswith("-")
                and prev_text[-2].isalpha()
                and next_text[:1].islower()
            )
            if not hyphen_join:
                runs.append(Run(" "))
        runs.extend(row_runs)
    return normalise_runs(runs)


# --------------------------------------------------------------------- furniture


def _dominant_style(pages: list[RawPage]) -> tuple[float, str]:
    sizes: dict[float, int] = {}
    fonts: dict[str, int] = {}

    def feed(spans) -> None:
        for s in spans:
            n = len(s.text.strip())
            if n:
                key = round(s.size * 2) / 2
                sizes[key] = sizes.get(key, 0) + n
                fonts[word_font_name(s.font)] = fonts.get(word_font_name(s.font), 0) + n

    for page in pages:
        for line in page.lines:
            feed(line.spans)
        for table in page.tables:  # a table-heavy document's body text lives in its cells
            for cell in table.cells:
                for spans in cell.spans:
                    feed(spans)
    if not sizes:
        return 11.0, "Arial"
    return max(sizes.items(), key=lambda kv: kv[1])[0], max(fonts.items(), key=lambda kv: kv[1])[0]


def _normalise_furniture(text: str) -> str:
    return re.sub(r"\d+", "#", text.strip().lower())


def repeated_furniture(pages: list[RawPage]) -> set[str]:
    """Texts that recur in the top/bottom page band: running heads and folios of any size."""
    counts: dict[str, int] = {}
    for page in pages:
        seen: set[str] = set()
        for line in page.lines:
            if line.y1 <= 0.10 * page.height or line.y0 >= 0.90 * page.height:
                text = _normalise_furniture(line.text)
                if text and len(text) <= 120:
                    seen.add(text)
        for text in seen:
            counts[text] = counts.get(text, 0) + 1
    needed = max(3, round(0.15 * len(pages)))
    return {text for text, n in counts.items() if n >= needed}


def split_furniture(
    page: RawPage, body_size: float, repeated: set[str] | None = None
) -> tuple[list[Line], list[Line], list[Line]]:
    """Separate running headers/footers from body lines.

    Furniture is small text (or a bare page number) in the outer page margins, or any text
    in the top/bottom band that repeats across pages.
    """
    repeated = repeated or set()
    body: list[Line] = []
    header: list[Line] = []
    footer: list[Line] = []
    top, bottom = 0.065 * page.height, 0.935 * page.height
    band_top, band_bottom = 0.10 * page.height, 0.90 * page.height
    for line in page.lines:
        text = line.text.strip()
        if len(text) > 120:
            body.append(line)
            continue
        number = bool(_PAGE_NUMBER_RE.match(text))
        small = line.size <= body_size - 0.5 or number
        recurring = _normalise_furniture(text) in repeated
        if (small and line.y1 <= top) or (recurring and line.y1 <= band_top):
            header.append(line)
        elif (small and line.y0 >= bottom) or ((recurring or number) and line.y0 >= band_bottom):
            footer.append(line)
        else:
            body.append(line)
    return body, header, footer


def _furniture_runs(lines: list[Line]) -> list[Run]:
    rows = [r for r in group_rows(sorted(lines, key=lambda ln: (ln.y0, ln.x0)), 1e9)]
    return rows_to_runs([r for r in rows if isinstance(r, Row)])


# ------------------------------------------------------------------ global passes


def _alignment(x0: float, x1: float, page: RawPage, left: float, right: float) -> str:
    centred = abs((x0 + x1) / 2 - page.width / 2) <= max(3.0, 0.01 * page.width)
    if centred and x0 - left > 18 and right - x1 > 18:
        return "center"
    return "left"


def _assign_lists(flow: list, model: DocumentModel) -> None:
    def marker_runs() -> list[list[Para]]:
        groups: list[list[Para]] = []
        cur: list[Para] = []
        for item in flow:
            if isinstance(item, Para) and item.marker is not None:
                cur.append(item)
            elif cur:
                groups.append(cur)
                cur = []
        if cur:
            groups.append(cur)
        return groups

    # Weak markers ("1. ", "- ", a bare number) only count next to a matching sibling.
    for group in marker_runs():
        keep: list[bool] = []
        for i, para in enumerate(group):
            m = para.marker
            if m.strong:
                keep.append(True)
                continue
            ok = False
            for j, step in ((i - 1, -1), (i + 1, 1)):
                if 0 <= j < len(group):
                    o = group[j].marker
                    if o.ordered != m.ordered or abs(o.marker_x - m.marker_x) > 6:
                        continue
                    if not m.ordered or (o.fmt == m.fmt and o.number - m.number == step):
                        ok = True
            keep.append(ok)
        for para, ok in zip(group, keep):
            if not ok:
                para.marker = None
                for row in para.rows:
                    row.marker = None

    next_id = 1
    for group in marker_runs():
        xs: list[float] = []
        for x in sorted(p.marker.marker_x for p in group):
            if not xs or x - xs[-1] > 6:
                xs.append(x)

        def level_of(p: Para, xs: list[float] = xs) -> int:
            idx = min(range(len(xs)), key=lambda i: abs(xs[i] - p.marker.marker_x))
            return min(idx, MAX_LIST_LEVEL)

        current: ListInfo | None = None
        last_top: Marker | None = None
        for para in group:
            lvl = level_of(para)
            m = para.marker
            restart = current is None
            if not restart and lvl == 0 and last_top is not None:
                if m.ordered != last_top.ordered or (m.ordered and m.number <= last_top.number):
                    restart = True
            if restart:
                current = ListInfo(next_id, m.ordered)
                model.lists[next_id] = current
                next_id += 1
                last_top = None
                if m.ordered:
                    model.ordered_lists += 1
                else:
                    model.unordered_lists += 1
            if lvl == 0:
                last_top = m
            current.levels.setdefault(lvl, (m.ordered, m.fmt, max(m.number, 1), m.suffix))
            para.kind, para.level, para.list_id = "list", lvl, current.list_id


def _assign_headings(flow: list, model: DocumentModel, pages: list[RawPage]) -> None:
    body = model.body_size
    candidates: list[Para] = []
    for item in flow:
        if not isinstance(item, Para) or item.marker is not None or item.hint:
            continue
        text = item.text.strip()
        if len(item.rows) > 3 or len(text) > 160 or not any(ch.isalpha() for ch in text):
            continue
        sized = item.size >= HEADING_SIZE_RATIO * body
        # "Chapter 7" / "Part Two" set apart on its own line is a heading even at body size
        chapter = (
            len(item.rows) == 1
            and len(text) <= 60
            and bool(_CHAPTER_RE.match(text))
            and not text.endswith((".", ",", ";"))
            and (item.align == "center" or item.all_bold or item.size > body + 0.3)
        )
        sized = sized or chapter
        bold_only = (
            item.all_bold
            and item.size >= body - 0.3
            and len(item.rows) <= 2
            and len(text) <= 90
            and not text.endswith((".", ",", ";", ":"))
            and all(len(r.segs) == 1 for r in item.rows)
        )
        if sized or bold_only:
            candidates.append(item)
    if not candidates:
        return

    def key(p: Para) -> tuple[float, bool, bool]:
        return (round(p.size * 2) / 2, p.all_bold, p.all_italic)

    first = candidates[0]
    top_size = max(p.size for p in candidates)
    others = [p.size for p in candidates[1:]]
    if first.page == 0 and first.size >= top_size - 0.1:
        if first.align == "center" or not others or first.size > max(others) + 0.1:
            first.kind = "title"
            model.title_style = HeadingStyle(first.size, first.all_bold, first.all_italic)
            candidates = candidates[1:]

    tiers = sorted({key(p) for p in candidates}, key=lambda k: (-k[0], k[2], not k[1]))
    for para in candidates:
        level = min(tiers.index(key(para)) + 1, 3)
        para.kind, para.level = "heading", level
        model.heading_counts[level] = model.heading_counts.get(level, 0) + 1
        model.heading_styles.setdefault(level, HeadingStyle(*key(para)))


def _spacing_stats(flow: list, model: DocumentModel) -> None:
    body = model.body_size
    pitches: list[float] = []
    for item in flow:
        if isinstance(item, Para) and item.kind == "body" and abs(item.size - body) <= 0.6:
            pitches += [b.y0 - a.y0 for a, b in zip(item.rows, item.rows[1:]) if b.y0 > a.y0]
    if len(pitches) >= 3:
        model.line_pitch = statistics.median(pitches)
    pitch = model.line_pitch or 1.2 * body
    gaps: list[float] = []
    for a, b in zip(flow, flow[1:]):
        if (
            isinstance(a, Para)
            and isinstance(b, Para)
            and a.kind == b.kind == "body"
            and a.leaf == b.leaf
            and abs(a.size - body) <= 0.6
            and abs(b.size - body) <= 0.6
        ):
            gaps.append(b.rows[0].y0 - a.rows[-1].y0 - pitch)
    if gaps:
        model.paragraph_gap = min(24.0, max(0.0, statistics.median(gaps)))


def _cell_runs(cell: RawCell) -> list[Run]:
    runs: list[Run] = []
    for spans in cell.spans:
        if runs:
            runs.append(Run(" "))
        runs.extend(_spans_to_runs(spans))
    return normalise_runs(runs)


def table_to_model(raw: RawTable) -> Table:
    rows: list[list[TableCell | None]] = [[None] * raw.n_cols for _ in range(raw.n_rows)]
    covered = [[False] * raw.n_cols for _ in range(raw.n_rows)]
    for cell in raw.cells:
        if cell.row >= raw.n_rows or cell.col >= raw.n_cols:
            continue
        if covered[cell.row][cell.col]:
            continue  # origin already inside another cell: malformed grid
        row_span = min(cell.row_span, raw.n_rows - cell.row)
        col_span = min(cell.col_span, raw.n_cols - cell.col)
        area = [
            (r, c) for r in range(cell.row, cell.row + row_span) for c in range(cell.col, cell.col + col_span)
        ]
        if any(covered[r][c] for r, c in area):
            # PyMuPDF occasionally reports overlapping cells; a non-rectangular merge is not
            # representable in Word, so the cell keeps only its own slot.
            row_span = col_span = 1
            area = [(cell.row, cell.col)]
        rows[cell.row][cell.col] = TableCell(_cell_runs(cell), row_span, col_span)
        for r, c in area:
            covered[r][c] = True
    for r in range(raw.n_rows):
        for c in range(raw.n_cols):
            if not covered[r][c]:
                rows[r][c] = TableCell()
    widths = [b - a for a, b in zip(raw.col_edges, raw.col_edges[1:])]
    table = Table(rows, widths, ruled=raw.ruled)
    if raw.ruled and len(raw.row_edges) == raw.n_rows + 1:
        table.row_heights = [b - a for a, b in zip(raw.row_edges, raw.row_edges[1:])]

    def all_bold(row) -> bool:
        cells = [c for c in row if c is not None and c.text]
        return bool(cells) and all(r.bold for c in cells for r in c.runs if r.text.strip())

    if len(rows) >= 2 and all_bold(rows[0]) and not all_bold(rows[1]):
        table.header_rows = 1
    return table


def _row_text(row) -> list[str]:
    return [c.text if c is not None else "" for c in row]


def _merge_continued_tables(entries: list[Entry], merge: bool = True) -> list[Entry]:
    """Join a table continued on the next page with its first part.

    With `merge` off (layout-faithful mode) each page keeps its own part, exactly as printed,
    and the continuation is only flagged so it is not counted as another table.
    """
    out: list[Entry] = []
    for entry in entries:
        prev = out[-1] if out else None
        if (
            prev is not None
            and isinstance(prev.block, Table)
            and isinstance(entry.block, Table)
            and entry.page == prev.meta.get("last_page", prev.page) + 1
            and entry.block.n_cols == prev.block.n_cols
            and entry.block.ruled == prev.block.ruled
        ):
            a, b = prev.block, entry.block
            total = sum(a.col_widths) or 1.0
            if all(abs(x - y) <= 0.05 * total for x, y in zip(a.col_widths, b.col_widths)):
                if not merge:
                    entry.meta["continuation"] = True
                    if b.rows and _row_text(b.rows[0]) == _row_text(a.rows[0]):
                        b.header_rows = max(b.header_rows, 1)
                    out.append(entry)
                    continue
                rows, heights = b.rows, b.row_heights
                if rows and _row_text(rows[0]) == _row_text(a.rows[0]):
                    # repeated header row of a table continued on a new page
                    rows, heights = rows[1:], heights[1:]
                    a.header_rows = max(a.header_rows, 1)
                if len(a.row_heights) == len(a.rows) and len(heights) == len(rows):
                    a.row_heights.extend(heights)
                else:
                    a.row_heights = []
                a.rows.extend(rows)
                prev.meta["last_page"] = entry.page
                prev.meta.setdefault("covers", set()).add(entry.page)
                continue
        out.append(entry)
    return out


def _merge_continued_paragraphs(entries: list[Entry], across_pages: bool) -> list[Entry]:
    """Rejoin a paragraph that was split by a column boundary (and, in flow mode, a page)."""
    out: list[Entry] = []
    for entry in entries:
        prev = out[-1] if out else None
        if (
            prev is not None
            and isinstance(prev.block, Paragraph)
            and isinstance(entry.block, Paragraph)
            and prev.block.kind == entry.block.kind == "body"
            and (prev.page, prev.leaf) != (entry.page, entry.leaf)
            and (across_pages or prev.page == entry.page)
            and abs(prev.block.size - entry.block.size) <= 0.3
            and prev.last_row_full
        ):
            a, b = prev.block.text.rstrip(), entry.block.text.lstrip()
            tail = a.rstrip("\"'”’)]")
            if (
                a
                and b
                and not tail.endswith(_SENTENCE_END)
                and (b[0].islower() or tail.endswith((",", "-", "–")))
            ):
                joiner = [] if a.endswith("-") and b[0].islower() else [Run(" ")]
                prev.block.runs = normalise_runs(prev.block.runs + joiner + entry.block.runs)
                prev.last_row_full = entry.last_row_full
                prev.page, prev.leaf = entry.page, entry.leaf
                continue
        entry.meta.setdefault("first_page", entry.page)
        out.append(entry)
    return out


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _percentile(values: list[float], q: float) -> float:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(q * len(ordered)))]


def text_measure(pages: list[RawPage], body_size: float) -> dict[int, tuple[float, float]]:
    """Left/right edge of the running text per page, shared by pages of the same size.

    The right edge comes from lines that are followed by another line in their block (so a
    paragraph's short last line does not count); a high percentile ignores stray wide lines.
    """
    groups: dict[tuple[int, int], list[RawPage]] = {}
    for page in pages:
        groups.setdefault((round(page.width), round(page.height)), []).append(page)
    out: dict[int, tuple[float, float]] = {}
    for group in groups.values():
        lefts: dict[int, int] = {}
        rights: list[float] = []
        for page in group:
            by_block: dict[int, list[Line]] = {}
            for line in page.lines:
                if abs(line.size - body_size) <= 1.5:
                    by_block.setdefault(line.block, []).append(line)
                    lefts[round(line.x0)] = lefts.get(round(line.x0), 0) + 1
            for lines in by_block.values():
                ordered = sorted(lines, key=lambda ln: ln.y0)
                rights += [a.x1 for a, b in zip(ordered, ordered[1:]) if b.y0 > a.y0 + 2]
        for page in group:
            xs0 = [ln.x0 for ln in page.lines] or [72.0]
            xs1 = [ln.x1 for ln in page.lines] or [page.width - 72.0]
            left = float(max(lefts, key=lefts.get)) if lefts else min(xs0)
            right = _percentile(rights, 0.95) if len(rights) >= 5 else max(xs1)
            out[page.index] = (min(left, min(xs0)), max(right, left + 50))
    return out


def _place_image(raw: RawImage, page: RawPage, measure, beside_text: bool) -> str:
    """How a picture must be anchored to keep the page layout (layout-faithful mode)."""
    x0, y0, x1, y1 = raw.bbox
    if raw.full_page:
        return "behind"
    if beside_text:
        return "square"
    edge = 4.0
    touches_edge = x0 <= edge or y0 <= edge or x1 >= page.width - edge or y1 >= page.height - edge
    left, right = measure
    outside = x0 < left - 12 or x1 > right + 12  # wider than the text column: cannot sit in the flow
    return "topbottom" if (touches_edge or outside) else "inline"


def recover_structure(
    pages: list[RawPage],
    pdf: pymupdf.Document | None = None,
    progress: Callable[[int, int], None] | None = None,
    layout_mode: str = "faithful",
) -> DocumentModel:
    faithful = layout_mode != "flow"
    model = DocumentModel(layout_mode="faithful" if faithful else "flow", page_count=len(pages))
    model.images_in_source = sum(p.source_images for p in pages)
    model.body_size, model.body_font = _dominant_style(pages)
    repeated = repeated_furniture(pages)
    # Running heads and feet must not decide what "body text" is (an image-heavy document
    # can have more footer text than content), so measure again without them.
    stripped = []
    for page in pages:
        body_only, _, _ = split_furniture(page, model.body_size, repeated)
        stripped.append(RawPage(page.index, page.width, page.height, body_only, [], page.tables, 0))
    if any(p.lines for p in stripped):
        model.body_size, model.body_font = _dominant_style(stripped)
    measure = text_measure(stripped, model.body_size)

    flow: list = []
    page_of: dict[int, RawPage] = {p.index: p for p in pages}
    extents: dict[int, tuple[float, float, float, float]] = {}
    floating: dict[int, list[Picture]] = {}
    leaf_counter = 0
    header_set = footer_set = False

    for n, page in enumerate(pages):
        body_lines, header, footer = split_furniture(page, model.body_size, repeated)
        if header and not header_set:
            model.header, header_set = _furniture_runs(header), True
        if footer and not footer_set:
            footer_set = True
            runs = _furniture_runs(footer)
            text = "".join(r.text for r in runs)
            m = re.fullmatch(r"(\D*?)(\d+)(.*)", text)
            if m and int(m.group(2)) == page.index + 1 and runs:
                model.footer_page_field = (m.group(1), m.group(3))
                model.footer = [runs[0]]
            else:
                model.footer = runs

        text_elems: list = [*body_lines, *page.tables]
        # Pictures that cannot sit in the text flow without changing the page are floated.
        inline_images: list[RawImage] = []

        def float_picture(raw: RawImage, wrap: str, page_index: int = page.index) -> None:
            model.images_detected += 1
            floating.setdefault(page_index, []).append(
                Picture(
                    raw.data, raw.ext, raw.bbox[2] - raw.bbox[0], raw.bbox[3] - raw.bbox[1],
                    wrap=wrap, x=raw.bbox[0], y=raw.bbox[1],
                )
            )  # fmt: skip

        for raw in page.images:
            page_measure = measure.get(page.index, (72.0, page.width - 72.0))
            # whether text is set beside a picture is decided per column, after layout
            wrap = _place_image(raw, page, page_measure, False) if faithful else "inline"
            if not faithful and raw.full_page and body_lines:
                continue  # flow mode cannot overlay text on a page-sized picture
            if wrap == "inline":
                inline_images.append(raw)
                continue
            float_picture(raw, wrap)

        elems: list = [*body_lines, *inline_images, *page.tables, *page.rules]
        box_elems = text_elems or inline_images
        if box_elems:
            extents[page.index] = (
                min(e.bbox[0] for e in box_elems),
                min(e.bbox[1] for e in box_elems),
                max(e.bbox[2] for e in box_elems),
                max(e.bbox[3] for e in box_elems),
            )
        leaves, tags, gutter_width = split_columns(elems)
        multi = any(t is not None for t in tags)
        if multi:
            model.multi_column_pages += 1
        fitz_page = pdf[page.index] if pdf is not None else None
        open_tag: tuple[int, int] | None = None

        starts: dict[tuple[int, int], float] = {}
        for leaf, tag in zip(leaves, tags):
            if tag is not None and leaf:
                starts[tag] = min(starts.get(tag, 1e9), min(e.bbox[0] for e in leaf))

        def mark(
            kind: str,
            zone: int = -1,
            page_index: int = page.index,
            gap: float = gutter_width,
            starts: dict = starts,
        ) -> None:
            offset = starts.get((zone, 1), 0.0) - starts.get((zone, 0), 0.0) if (zone, 1) in starts else 0.0
            column_mark = ColumnMark(kind, max(gap, 6.0), max(offset, 0.0))
            flow.append((column_mark, page_index, len(flow), {}))

        page_bottom: float | None = None  # lowest content laid out so far on this page
        zone_ref: float | None = None  # ... as it was when the current column zone began
        for leaf, tag in zip(leaves, tags):
            if faithful:
                # a picture with this column's text set beside it floats; the text wraps round it
                for raw in [e for e in leaf if isinstance(e, RawImage)]:
                    beside = sum(
                        1
                        for ln in leaf
                        if isinstance(ln, Line)
                        and raw.bbox[1] <= (ln.y0 + ln.y1) / 2 <= raw.bbox[3]
                        and (ln.x1 <= raw.bbox[0] + 2 or ln.x0 >= raw.bbox[2] - 2)
                    )
                    if beside >= 2:
                        leaf.remove(raw)
                        float_picture(raw, "square")
            if tag is None or open_tag is None or tag[0] != open_tag[0]:
                zone_ref = page_bottom
            if faithful and tag != open_tag:
                # real Word columns keep a multi-column page on one page
                if open_tag is not None and tag is not None and tag[0] == open_tag[0]:
                    mark("break")
                else:
                    if open_tag is not None:
                        mark("end")
                    if tag is not None:
                        mark("start", tag[0])
                        if tag[1] == 1:
                            mark("break")
                open_tag = tag
            in_column = tag is not None
            leaf_counter += 1
            items = group_rows(leaf, model.body_size)
            items = detect_borderless_tables(items, fitz_page, page.index)
            rows = [it for it in items if isinstance(it, Row)]
            if in_column and rows:
                ctx = LeafContext(min(r.x0 for r in rows), max(r.x1 for r in rows), model.body_size)
            else:
                ctx = LeafContext(
                    *measure.get(page.index, (72.0, page.width - 72.0)),
                    model.body_size,
                    page_mid=page.width / 2,
                )
            ctx.obstacles = tuple(img.bbox for img in page.images)
            prev = None
            ref_bottom = zone_ref if in_column else page_bottom
            index_like = semantics.looks_like_index_column([r.segs[0] for r in rows])
            for item in build_paragraphs(
                items, page.index, leaf_counter, model.body_size, ctx, in_column, entries=index_like
            ):
                if isinstance(item, Para):
                    if prev is None and ref_bottom is not None:
                        # first block of a column (or after one): measured from what is above it
                        item.space_before = max(0.0, min(item.rows[0].y0 - ref_bottom, 240.0))
                        item.top_y = None
                    flow.append(item)
                else:
                    if prev is None and ref_bottom is not None:
                        gap, top = max(0.0, min(item.bbox[1] - ref_bottom, 240.0)), None
                    elif prev is None:
                        gap, top = 0.0, item.bbox[1]
                    else:
                        bottom = prev.rows[-1].y1 if isinstance(prev, Para) else prev.bbox[3]
                        gap, top = max(0.0, min(item.bbox[1] - bottom, 240.0)), None
                    info = {"gap": gap, "top": top, "ctx_left": ctx.left, "multi": in_column}
                    flow.append((item, page.index, leaf_counter, info))
                prev = item
            if leaf:
                page_bottom = max(page_bottom or 0.0, max(e.bbox[3] for e in leaf))
        if faithful and open_tag is not None:
            mark("end")
        if progress is not None:
            progress(n + 1, len(pages))

    paras_only = [x if isinstance(x, Para) else None for x in flow]
    semantics.assign_regions(flow, {p.index: p.width for p in pages})
    _assign_lists(paras_only, model)
    semantics.assign_captions(flow, model.body_size)
    semantics.assign_footnotes(
        flow, {p.index: p.height for p in pages}, model.body_size, {p.index: p.rules for p in pages}
    )
    _assign_headings([x for x in paras_only if x is not None], model, pages)
    _spacing_stats(paras_only, model)
    _resolve_spacing([x for x in paras_only if x is not None])

    # ---- convert to model blocks
    entries: list[Entry] = []
    toc_levels = sorted({round(p.rows[0].x0 / 6) for p in flow if isinstance(p, Para) and p.hint == "toc"})
    for item in flow:
        if isinstance(item, Para):
            marker = item.marker if item.kind == "list" else None
            runs = rows_to_runs(item.rows, marker)
            if not runs:
                continue
            kind, level = item.kind, item.level
            if item.hint and kind == "body":
                kind = item.hint
                if kind == "toc":
                    level = min(toc_levels.index(round(item.rows[0].x0 / 6)) + 1, 3)
                    parts = semantics.split_contents_row("".join(r.text for r in runs))
                    if parts:  # "Title ....... 12" -> title, tab (dot leader), page number
                        first = runs[0]
                        runs = [
                            Run(
                                parts[0], first.bold, first.italic, False, first.size, first.font, first.color
                            ),
                            Run(
                                "\t" + parts[1],
                                first.bold,
                                first.italic,
                                False,
                                first.size,
                                first.font,
                                first.color,
                            ),
                        ]
            para = Paragraph(
                runs, kind, level, bool(marker and marker.ordered), item.list_id, item.align, item.size
            )
            geo = item.geo
            para.line_pitch = geo.pitch if geo else None
            para.space_before = item.space_before
            widths = [r.x1 - r.x0 for r in item.rows]
            full = len(widths) < 2 or widths[-1] >= 0.8 * max(widths)
            entries.append(
                Entry(
                    para,
                    item.page,
                    item.leaf,
                    last_row_full=full,
                    meta={
                        "left_x": geo.left_x if geo else item.rows[0].x0,
                        "first_x": geo.first_x if geo else item.rows[0].x0,
                        "single": len(item.rows) == 1,
                        "ctx_left": item.ctx_left,
                        "multi": item.multi,
                        "top": item.top_y,
                    },
                )
            )
            continue
        raw, page_index, leaf, info = item
        page = page_of[page_index]
        left, _, right, _ = extents.get(page_index, (0, 0, page.width, 0))
        meta = {}
        if not isinstance(raw, ColumnMark):
            meta = {"x0": raw.bbox[0], "x1": raw.bbox[2], "y0": raw.bbox[1], "y1": raw.bbox[3], **info}
        if isinstance(raw, ColumnMark):
            entries.append(Entry(raw, page_index, leaf))
            continue
        if isinstance(raw, RawImage):
            pic = Picture(raw.data, raw.ext, raw.bbox[2] - raw.bbox[0], raw.bbox[3] - raw.bbox[1])
            model.images_detected += 1
            prev = entries[-1] if entries else None
            if (
                prev is not None
                and isinstance(prev.block, ImageRow)
                and (prev.page, prev.leaf) == (page_index, leaf)
                and prev.meta["y0"] <= (raw.bbox[1] + raw.bbox[3]) / 2 <= prev.meta["y1"]
            ):
                prev.block.images.append(pic)
                prev.meta["x1"] = raw.bbox[2]
                prev.block.align = _alignment(prev.meta["x0"], raw.bbox[2], page, left, right)
                continue
            row = ImageRow([pic], _alignment(raw.bbox[0], raw.bbox[2], page, left, right))
            row.space_before = info["gap"]
            entries.append(Entry(row, page_index, leaf, meta=meta))
        elif isinstance(raw, RawTable):
            table = table_to_model(raw)
            table.align = _alignment(raw.bbox[0], raw.bbox[2], page, left, right)
            entries.append(Entry(table, page_index, leaf, meta=meta))
        elif isinstance(raw, RawRule):
            rule = Rule(raw.bbox[2] - raw.bbox[0], space_before=info["gap"])
            entries.append(Entry(rule, page_index, leaf, meta=meta))

    # a figure and its caption stay together
    for a, b in zip(entries, entries[1:]):
        pair = (a.block, b.block)
        if a.page != b.page:
            continue
        if (
            isinstance(pair[0], ImageRow | Table)
            and isinstance(pair[1], Paragraph)
            and pair[1].kind == "caption"
        ):
            if isinstance(pair[0], ImageRow):
                pair[0].keep_with_next = True
        elif (
            isinstance(pair[0], Paragraph)
            and pair[0].kind == "caption"
            and isinstance(pair[1], ImageRow | Table)
        ):
            pair[0].keep_with_next = True

    entries = _merge_continued_tables(entries, merge=not faithful)
    entries = _merge_continued_paragraphs(entries, across_pages=not faithful)
    model.tables_detected = sum(
        1 for e in entries if isinstance(e.block, Table) and not e.meta.get("continuation")
    )

    _build_sections(model, pages, entries, extents, floating, faithful)
    return model


def _resolve_spacing(paras: list[Para]) -> None:
    """Space-before = baseline distance to the paragraph above, less this paragraph's own
    line height as Word will set it (the source leading for body text, the font's natural
    height for headings)."""
    by_size: dict[float, dict[float, int]] = {}
    for p in paras:
        if p.geo and p.geo.pitch:
            sizes = by_size.setdefault(round(p.size * 2) / 2, {})
            key = round(p.geo.pitch * 2) / 2
            sizes[key] = sizes.get(key, 0) + 1
    typical = {size: max(c, key=c.get) for size, c in by_size.items()}
    for p in paras:
        if p.base_gap is None:
            continue
        natural = 1.15 * p.size
        if p.geo and p.geo.pitch:
            line = max(p.geo.pitch, natural) if p.kind in ("title", "heading") else p.geo.pitch
        elif p.kind in ("title", "heading", "list"):
            line = natural
        else:
            line = max(typical.get(round(p.size * 2) / 2, natural), natural)
        p.space_before = max(0.0, min(p.base_gap - line, 240.0))


def _apply_geometry(entry: Entry, section: Section, typical_first: float | None) -> None:
    """Convert absolute x positions into Word indents relative to the section margin."""
    block, meta = entry.block, entry.meta
    base = meta.get("ctx_left", section.margin_left) if meta.get("multi") else section.margin_left
    if isinstance(block, Paragraph):
        if block.kind == "list" or block.align in ("center", "right") or "left_x" not in meta:
            return
        left = meta["left_x"] - base
        first = meta["first_x"] - meta["left_x"]
        if meta.get("single") and typical_first and abs(left - typical_first) <= 1.5:
            left, first = 0.0, typical_first  # a one-line paragraph with the usual first-line indent
        block.indent_left = round(left * 2) / 2 if left >= 1.5 else 0.0
        block.first_indent = round(first * 2) / 2 if abs(first) >= 1.5 else 0.0
    elif isinstance(block, ImageRow | Rule):
        if getattr(block, "align", "left") == "left":
            left = meta["x0"] - base
            block.indent_left = round(left * 2) / 2 if left >= 1.5 else 0.0


def _build_sections(model, pages, entries, extents, floating, faithful) -> None:
    def first_page(e: Entry) -> int:
        return e.meta.get("first_page", e.page) if isinstance(e.block, Paragraph) else e.page

    by_page: dict[int, list[Entry]] = {}
    covered: set[int] = set()  # pages whose content continues a table begun earlier
    for e in entries:
        by_page.setdefault(first_page(e), []).append(e)
        covered |= e.meta.get("covers", set())

    firsts = [
        round(e.meta["first_x"] - e.meta["left_x"])
        for e in entries
        if isinstance(e.block, Paragraph)
        and not e.meta.get("single")
        and e.meta.get("first_x", 0) - e.meta.get("left_x", 0) > 3
    ]
    typical_first = float(statistics.mode(firsts)) if len(firsts) >= 3 else None

    # group pages of equal size into sections and derive margins from their text
    sections: list[tuple[Section, list[RawPage]]] = []
    for page in pages:
        current = sections[-1][0] if sections else None
        if current is None or abs(current.width - page.width) > 2 or abs(current.height - page.height) > 2:
            sections.append((Section(page.width, page.height, 72, 72, 72, 72), []))
        sections[-1][1].append(page)

    for section, group in sections:
        exts = [extents[p.index] for p in group if p.index in extents]
        if exts:
            left = _clamp(min(e[0] for e in exts), 28, 0.25 * section.width)
            right = _clamp(section.width - max(e[2] for e in exts), 28, left)
            top = _clamp(min(e[1] for e in exts), 28, 110)
            bottom = _clamp(section.height - max(e[3] for e in exts), 28, top)
            if faithful:
                # Leave slack so a page whose text runs slightly longer in Word's fonts does
                # not spill a few lines onto an extra page before the explicit page break.
                bottom = max(18.0, bottom - 24.0)
            section.margin_left, section.margin_right = left, right
            section.margin_top, section.margin_bottom = top, bottom
        model.sections.append(section)

        for n, page in enumerate(group):
            page_entries = by_page.get(page.index, [])
            blocks = [e.block for e in page_entries]
            for e in page_entries:
                _apply_geometry(e, section, typical_first)
            if page_entries and page_entries[0].meta.get("top") is not None and (faithful or n == 0):
                first = page_entries[0].block
                if hasattr(first, "space_before"):
                    first.space_before = max(
                        0.0, min(page_entries[0].meta["top"] - section.margin_top, 400.0)
                    )
            blocks_real = [b for b in blocks if not isinstance(b, ColumnMark)]
            pictures = floating.get(page.index, [])
            if pictures:
                host = next((b for b in blocks if isinstance(b, Paragraph)), None)
                if host is None:
                    host = Paragraph([], size=model.body_size)
                    blocks.insert(0, host)
                host.anchors.extend(pictures)
            blocks_real = [b for b in blocks if not isinstance(b, ColumnMark)]
            if faithful:
                if not blocks_real and page.index not in covered:  # a blank page still occupies a page
                    blocks = [Paragraph([], size=model.body_size)]
                ended = section.blocks[-1] if section.blocks else None
                closes_columns = isinstance(ended, ColumnMark) and ended.kind == "end"
                if n > 0 and blocks and closes_columns and not isinstance(blocks[0], ColumnMark):
                    # the section break that closes the columns also starts the new page;
                    # a column zone that ends with its page is then not re-balanced
                    ended.page_break_before = True
                elif n > 0 and blocks and not (page.index in covered and page.index - 1 in covered | {-1}):
                    blocks[0].page_break_before = page.index not in covered
            elif n > 0 and blocks:
                # flow mode: only a page that ended well short of the bottom was a real break
                ext = extents.get(group[n - 1].index)
                prev = group[n - 1]
                if ext is not None and ext[3] < prev.height - _clamp(ext[1], 28, 110) - 0.15 * prev.height:
                    blocks[0].page_break_before = True
            section.blocks.extend(blocks)
    if not model.sections:
        model.sections.append(Section(612, 792, 72, 72, 72, 72))
    last = model.sections[-1].blocks
    if last and isinstance(last[-1], ColumnMark) and last[-1].kind == "end":
        last.pop()  # columns that run to the end of the document need no closing break
