"""Reading-order recovery: detect column gutters from x-coordinates and order page elements.

The page is cut recursively. A vertical gutter is accepted only when both sides look like
columns of wrapped prose; elements crossing the gutter (titles, full-width paragraphs) split
the page into horizontal zones that are read top to bottom, and within a zone the left column
is read completely before the right one.
"""

from __future__ import annotations

from .extract import Line
from .semantics import looks_like_index_column

MAX_DEPTH = 3


def _w(e) -> float:
    return e.bbox[2] - e.bbox[0]


def sort_rows(elems: list) -> list:
    """Top-to-bottom, then left-to-right for elements sharing a visual row."""
    rows: list[list] = []
    for e in sorted(elems, key=lambda e: (e.bbox[1], e.bbox[0])):
        yc = (e.bbox[1] + e.bbox[3]) / 2
        if rows:
            ref = rows[-1][0]
            ref_c = (ref.bbox[1] + ref.bbox[3]) / 2
            if ref.bbox[1] <= yc <= ref.bbox[3] and e.bbox[1] <= ref_c <= e.bbox[3]:
                rows[-1].append(e)
                continue
        rows.append([e])
    return [e for row in rows for e in sorted(row, key=lambda e: e.bbox[0])]


def _is_text_column(side: list, content_width: float) -> bool:
    lines = [e for e in side if isinstance(e, Line)]
    if len(lines) < 3:
        return False
    if looks_like_index_column(lines):
        return True  # index columns are ragged entry lists, not wrapped prose
    x0 = min(e.bbox[0] for e in side)
    x1 = max(e.bbox[2] for e in side)
    width = x1 - x0
    if width < 0.2 * content_width:
        return False
    # Wrapped prose: some block stacks several baselines, and many lines run the full width.
    by_block: dict[int, set[int]] = {}
    for ln in lines:
        by_block.setdefault(ln.block, set()).add(round(ln.y0))
    if not any(len(ys) >= 2 for ys in by_block.values()):
        return False
    full = sum(1 for ln in lines if _w(ln) >= 0.7 * width)
    return full >= 0.4 * len(lines)


def _prose_blocks(elems: list, width: float) -> list[tuple[float, float]]:
    """x-extents of wrapped text blocks (several baselines) that are not full width."""
    blocks: dict[int, list[Line]] = {}
    for e in elems:
        if isinstance(e, Line):
            blocks.setdefault(e.block, []).append(e)
    out: list[tuple[float, float]] = []
    for lines in blocks.values():
        if len({round(ln.y0) for ln in lines}) < 2:
            continue
        x0, x1 = min(ln.x0 for ln in lines), max(ln.x1 for ln in lines)
        if x1 - x0 < 0.6 * width:
            out.append((x0, x1))
    return out


def find_gutter(elems: list) -> tuple[float, float] | None:
    if sum(1 for e in elems if isinstance(e, Line)) < 6:
        return None
    left_edge = min(e.bbox[0] for e in elems)
    right_edge = max(e.bbox[2] for e in elems)
    width = right_edge - left_edge
    if width < 200:
        return None
    # Candidate gutters come from wrapped prose only: single-line elements such as a short
    # centred title may bridge the gutter without disproving the columns below them.
    merged: list[list[float]] = []
    for x0, x1 in sorted(_prose_blocks(elems, width)):
        if merged and x0 <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], x1)
        else:
            merged.append([x0, x1])
    min_gap = max(9.0, 0.015 * width)
    best: tuple[float, float] | None = None
    for a, b in zip(merged, merged[1:]):
        g0, g1 = a[1], b[0]
        if g1 - g0 < min_gap:
            continue
        left = [e for e in elems if e.bbox[2] <= g0 + 0.5]
        right = [e for e in elems if e.bbox[0] >= g1 - 0.5]
        crossing = len(elems) - len(left) - len(right)
        if crossing > 0.25 * len(elems):
            continue
        if not (_is_text_column(left, width) and _is_text_column(right, width)):
            continue
        l_top, l_bot = min(e.bbox[1] for e in left), max(e.bbox[3] for e in left)
        r_top, r_bot = min(e.bbox[1] for e in right), max(e.bbox[3] for e in right)
        overlap = min(l_bot, r_bot) - max(l_top, r_top)
        if overlap < 0.3 * min(l_bot - l_top, r_bot - r_top):
            continue
        if best is None or (g1 - g0) > (best[1] - best[0]):
            best = (g0, g1)
    return best


def crosses_gutter(e, g0: float, g1: float) -> bool:
    """True for content that belongs to neither column.

    That is anything covering the middle of the gutter, and anything that begins inside it
    (a centred heading over a wide gutter). A column element that merely overhangs into the
    gutter, such as a picture a little wider than its column, stays in its column.
    """
    mid = (g0 + g1) / 2
    x0, x1 = e.bbox[0], e.bbox[2]
    return (x0 < mid < x1) or (g0 + 1 < x0 < g1 - 6)


def split_columns(elems: list) -> tuple[list[list], list[tuple[int, int] | None], float]:
    """Like split_leaves, and also says which column zone each leaf belongs to.

    Returns (leaves, tags, gutter width); a tag is (zone, column index) or None for content
    that spans the page width.
    """
    gutter = find_gutter(elems) if elems else None
    if gutter is None:
        return ([sort_rows(elems)] if elems else []), ([None] if elems else []), 0.0
    g0, g1 = gutter
    leaves: list[list] = []
    tags: list[tuple[int, int] | None] = []
    zone = -1
    group: list = []
    spanning: bool | None = None

    def flush() -> None:
        nonlocal zone
        if not group:
            return
        if spanning:
            leaves.append(sort_rows(group))
            tags.append(None)
            return
        zone += 1
        mid = (g0 + g1) / 2
        for column, side in enumerate(
            (
                [e for e in group if (e.bbox[0] + e.bbox[2]) / 2 < mid],
                [e for e in group if (e.bbox[0] + e.bbox[2]) / 2 >= mid],
            )
        ):
            sub, _ = split_leaves(side, 1)
            leaves.extend(sub)
            tags.extend([(zone, column)] * len(sub))

    for e in sorted(elems, key=lambda e: ((e.bbox[1] + e.bbox[3]) / 2, e.bbox[0])):
        s = crosses_gutter(e, g0, g1)
        if spanning is not None and s != spanning:
            flush()
            group = []
        spanning = s
        group.append(e)
    flush()
    return leaves, tags, g1 - g0


def split_leaves(elems: list, depth: int = 0) -> tuple[list[list], bool]:
    """Return elements grouped into reading-order leaves, and whether columns were found."""
    if not elems:
        return [], False
    gutter = find_gutter(elems) if depth < MAX_DEPTH else None
    if gutter is None:
        return [sort_rows(elems)], False
    g0, g1 = gutter

    def spans(e) -> bool:
        return crosses_gutter(e, g0, g1)

    leaves: list[list] = []
    group: list = []
    group_spanning: bool | None = None

    def flush() -> None:
        if not group:
            return
        if group_spanning:
            leaves.append(sort_rows(group))
        else:
            mid = (g0 + g1) / 2
            for side in (
                [e for e in group if (e.bbox[0] + e.bbox[2]) / 2 < mid],
                [e for e in group if (e.bbox[0] + e.bbox[2]) / 2 >= mid],
            ):
                sub, _ = split_leaves(side, depth + 1)
                leaves.extend(sub)

    for e in sorted(elems, key=lambda e: ((e.bbox[1] + e.bbox[3]) / 2, e.bbox[0])):
        s = spans(e)
        if group_spanning is not None and s != group_spanning:
            flush()
            group = []
        group_spanning = s
        group.append(e)
    flush()
    return leaves, True
