"""Paragraph inference from line geometry.

PyMuPDF "blocks" are not paragraphs: a table of contents, a copyright page or an index is
often a single block of unrelated lines, and book prose marks paragraphs with a first-line
indent rather than a gap. Paragraph boundaries are therefore decided from the lines
themselves, using three signals:

* leading - a line further from its predecessor than the local line pitch starts a paragraph;
* wrap    - if the first word of a line would have fitted at the end of the previous line,
            the break was intentional (a contents row, an address line, a verse);
* indent  - a line indented against the paragraph's left edge starts a paragraph.

Rows are duck-typed (x0, x1, y0, size, baseline, block, segs).
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass

PITCH_TOLERANCE = 1.12


@dataclass(slots=True)
class LeafContext:
    left: float  # left edge of the text measure
    right: float  # right edge of the text measure
    body_size: float
    heading_ratio: float = 1.12
    page_mid: float | None = None  # page centre: display lines are often centred on the page
    # boxes (x0, y0, x1, y1) of pictures on the page: text set beside one ends early
    obstacles: tuple = ()


@dataclass(slots=True)
class ParaGeometry:
    align: str  # left | center | right | justify
    left_x: float  # x of continuation lines
    first_x: float  # x of the first line
    pitch: float | None  # baseline distance between lines, if the paragraph has several


def _size_key(row) -> float:
    return round(row.size * 2) / 2


def _pitch(a, b) -> float:
    return b.baseline - a.baseline


def reference_pitches(rows: list) -> dict[float, float]:
    """Tightest baseline distance between consecutive same-size rows, per font size."""
    out: dict[float, float] = {}
    for a, b in zip(rows, rows[1:]):
        if _size_key(a) != _size_key(b):
            continue
        p = _pitch(a, b)
        if p >= 0.9 * a.size and (p < out.get(_size_key(a), 1e9)):
            out[_size_key(a)] = p
    return out


def first_word_width(row) -> float:
    chars = [ch for span in row.segs[0].spans for ch in span.chars]
    start = None
    for ch in chars:
        if ch.c.isspace():
            if start is not None:
                return ch.x0 - start
            continue
        if start is None:
            start = ch.x0
    return (chars[-1].x1 - start) if start is not None and chars else 0.0


def _stanzas(rows: list, pitches: dict[float, float]) -> list[list]:
    """Runs of rows set solid: same size, each at the local line pitch from the previous."""
    out: list[list] = [[rows[0]]]
    for a, b in zip(rows, rows[1:]):
        ref = pitches.get(_size_key(a), 1.3 * a.size)
        solid = abs(a.size - b.size) <= 0.6 and 0 < _pitch(a, b) <= PITCH_TOLERANCE * ref + 0.5
        if solid:
            out[-1].append(b)
        else:
            out.append([b])
    return out


def column_measures(rows: list, ctx: LeafContext) -> dict[tuple[int, float], float]:
    """Right edge of text set to a narrower measure than the page (an indented quotation).

    Rows sharing a left edge and size reveal their measure when at least two of them end at
    the same right edge; without that evidence a short line is just a short line.
    """
    groups: dict[tuple[int, float], list] = {}
    for r in rows:
        groups.setdefault((round(r.x0 / 2), _size_key(r)), []).append(r)
    out: dict[tuple[int, float], float] = {}
    for key, group in groups.items():
        top = max(r.x1 for r in group)
        left = min(r.x0 for r in group)
        tol = 0.03 * max(top - left, 1.0)
        if sum(1 for r in group if r.x1 >= top - tol) >= 2 and top - left >= 0.45 * (ctx.right - ctx.left):
            out[key] = top
    return out


def _split_stanza(rows: list, ctx: LeafContext, measures: dict | None = None) -> list[list]:
    n = len(rows)
    if n == 1:
        return [rows]
    if rows[0].size >= ctx.heading_ratio * ctx.body_size:
        # A heading wrapped over several lines is one heading; unrelated display lines
        # come from different blocks.
        out = [[rows[0]]]
        for a, b in zip(rows, rows[1:]):
            (out[-1].append(b) if a.block == b.block else out.append([b]))
        return out

    left = min(r.x0 for r in rows)
    top = max(r.x1 for r in rows)
    tol = 0.03 * max(top - left, 1.0)
    filled = sum(1 for r in rows if r.x1 >= top - tol)
    # Two or more lines ending at the same edge reveal the paragraph's own measure
    # (an indented quotation); otherwise the page's text measure applies.
    own_measure = filled >= 2 and (top - left) >= 0.45 * max(ctx.right - ctx.left, 1.0)
    known = (measures or {}).get((round(left / 2), _size_key(rows[0])))
    measure = top if own_measure else max(top, known or ctx.right)
    avail = measure - left

    # Lines set beside a picture are cut short by it, not by intent: their measure is the
    # widest line beside that picture (or the picture's edge when only one line is).
    beside: dict[int, list] = {}
    for r in rows:
        mid_y = (r.y0 + r.y1) / 2
        for k, (ox0, oy0, _, oy1) in enumerate(ctx.obstacles):
            if oy0 <= mid_y <= oy1 and ox0 >= r.x1 - 2:
                beside.setdefault(k, []).append(r)
    narrowed: dict[int, float] = {}
    for k, group in beside.items():
        edge = max(r.x1 for r in group) if len(group) >= 2 else ctx.obstacles[k][0]
        for r in group:
            narrowed[id(r)] = min(narrowed.get(id(r), 1e9), edge)

    hard: list[bool] = []
    for prev, row in zip(rows, rows[1:]):
        gap = 0.25 * prev.size
        word = first_word_width(row)
        limit = min(measure, narrowed.get(id(prev), 1e9))
        fits = prev.x1 + gap + word < limit - 1.0
        centred = prev.x0 - left > 3 and abs((prev.x0 - left) - (measure - prev.x1)) <= 4
        if centred:
            fits = fits and (prev.x1 - prev.x0) + gap + word < avail - 1.0
        # a contents row ends at its page number however far right that number sits
        hard.append(fits or getattr(prev, "entry", False) or getattr(row, "entry", False))
    if n >= 4 and sum(hard) >= 0.6 * (n - 1):
        hard = [True] * (n - 1)  # a list of entries (contents, index, credits)

    xs = sorted(round(r.x0) for r in rows)
    cont_left = statistics.mode(xs)
    flush = sum(1 for r in rows if abs(r.x0 - cont_left) <= 1.5) >= 0.5 * n
    out = [[rows[0]]]
    for i, (prev, row) in enumerate(zip(rows, rows[1:])):
        # a modest indent against an otherwise flush-left run is a first-line indent
        indent_start = (
            flush
            and n >= 3
            and 3 < row.x0 - cont_left <= 4 * row.size
            and (prev.x0 - cont_left <= 3 or len(out[-1]) >= 2)
        )
        if hard[i] or indent_start:
            out.append([row])
        else:
            out[-1].append(row)
    return out


def split_rows(rows: list, ctx: LeafContext, pitches: dict[float, float]) -> list[list]:
    """Split consecutive text rows of one column into paragraphs."""
    if not rows:
        return []
    out: list[list] = []
    measures = column_measures(rows, ctx)
    for stanza in _stanzas(rows, pitches):
        out.extend(_split_stanza(stanza, ctx, measures))
    return out


def describe(rows: list, ctx: LeafContext) -> ParaGeometry:
    """Alignment, indents and leading of a paragraph from its lines."""
    n = len(rows)
    first = rows[0]
    width = max(ctx.right - ctx.left, 1.0)
    mid = (ctx.left + ctx.right) / 2
    if n == 1:
        centre = (first.x0 + first.x1) / 2
        tol = max(3.0, 0.01 * width)
        centred = abs(centre - mid) <= tol or (ctx.page_mid is not None and abs(centre - ctx.page_mid) <= tol)
        if centred and first.x0 - ctx.left > 12 and ctx.right - first.x1 > 12:
            return ParaGeometry("center", ctx.left, ctx.left, None)
        if ctx.right - first.x1 <= 3 and first.x0 - ctx.left > 0.3 * width:
            return ParaGeometry("right", ctx.left, ctx.left, None)
        return ParaGeometry("left", first.x0, first.x0, None)

    pitches = [_pitch(a, b) for a, b in zip(rows, rows[1:]) if _pitch(a, b) > 0]
    pitch = statistics.median(pitches) if pitches else None
    lefts = [r.x0 for r in rows]
    rights = [r.x1 for r in rows]
    centres = [(r.x0 + r.x1) / 2 for r in rows]

    def spread(values: list[float]) -> float:
        return max(values) - min(values)

    if spread(centres) <= 4 and spread(lefts) > 6:
        return ParaGeometry("center", ctx.left, ctx.left, pitch)
    if spread(rights) <= 3 and spread(lefts) > 6 and spread(lefts[1:]) > 6:
        return ParaGeometry("right", ctx.left, ctx.left, pitch)
    cont = min(lefts[1:])
    body_rights = rights[:-1]
    justified = spread(body_rights) <= 3 and (n >= 3 or abs(body_rights[0] - ctx.right) <= 3)
    return ParaGeometry("justify" if justified else "left", cont, first.x0, pitch)
