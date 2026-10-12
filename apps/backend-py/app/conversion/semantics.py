"""Logical roles beyond headings and lists: contents rows, index entries, captions, footnotes.

Each pass sets `hint` on paragraphs of the page flow. Paragraphs are duck-typed
(rows, text, size, page, leaf, marker, hint).
"""

from __future__ import annotations

import re

CONTENTS_RE = re.compile(r"^(table of )?contents$", re.I)
INDEX_RE = re.compile(r"^(subject |general |name )?index$", re.I)
CAPTION_RE = re.compile(
    r"^(fig(ure)?\.?|table|plate|chart|illustration|photo(graph)?|image|map|exhibit|listing)\s*\d+", re.I
)
LEADER_RE = re.compile(r"^(?P<title>.*?\S)[\s.·…_]{4,}(?P<page>\d{1,4}|[ivxlcdm]{1,7})$", re.I)
TRAILING_PAGE_RE = re.compile(r"^(?P<title>.*?\S)(?:\t|\s{2,})(?P<page>\d{1,4}|[ivxlcdm]{1,7})$", re.I)
FOOTNOTE_MARK_RE = re.compile(r"^(\d{1,3}|[*†‡§¶]{1,3})(?=[\s.)\]]|[^\W\d])")
INDEX_ENTRY_RE = re.compile(r",\s*\d+(?:\s*[–-]\s*\d+)?(?:,\s*\d+(?:\s*[–-]\s*\d+)?)*\.?$")


def _is_para(item) -> bool:
    return hasattr(item, "rows")


def split_contents_row(text: str) -> tuple[str, str] | None:
    """("Chapter 1", "5") for a contents row ending in a page number, else None."""
    m = LEADER_RE.match(text.strip()) or TRAILING_PAGE_RE.match(text.strip())
    return (m.group("title").rstrip(" ."), m.group("page")) if m else None


def _entry_like(para, width: float) -> bool:
    row = para.rows[0]
    return len(para.rows) == 1 and ((row.x1 - row.x0) <= 0.92 * width or getattr(row, "entry", False))


def assign_regions(flow: list, page_widths: dict[int, float]) -> None:
    """Mark contents and index regions, which start at their heading and run while pages
    keep consisting of short entry rows."""
    paras = [p for p in flow if _is_para(p)]
    by_page: dict[int, list] = {}
    for p in paras:
        by_page.setdefault(p.page, []).append(p)

    def entry_page(page: int, skip=()) -> bool:
        items = [p for p in by_page.get(page, []) if p not in skip]
        if len(items) < 3:
            return False
        width = page_widths.get(page, 612.0)
        return sum(1 for p in items if _entry_like(p, 0.75 * width)) >= 0.85 * len(items)

    for start in paras:
        if start.hint or start.marker is not None or len(start.rows) != 1:
            continue
        text = start.text.strip()
        kind = "toc" if CONTENTS_RE.match(text) else "index" if INDEX_RE.match(text) else None
        if kind is None or not entry_page(start.page, skip=(start,)):
            continue
        page = start.page
        while True:
            for p in by_page.get(page, []):
                if p is start or (page == start.page and paras.index(p) < paras.index(start)):
                    continue
                if not p.hint:
                    p.hint = kind
                    p.marker = None
                    for row in p.rows:
                        row.marker = None
            page += 1
            if not entry_page(page):
                break

    # Contents rows without a "Contents" heading: runs of rows ending in dot leaders + number.
    run: list = []
    for p in [*paras, None]:
        if p is not None and not p.hint and len(p.rows) == 1 and LEADER_RE.match(p.text.strip()):
            run.append(p)
            continue
        if len(run) >= 3:
            for q in run:
                q.hint = "toc"
        run = []


def assign_captions(flow: list, body_size: float) -> None:
    """A short paragraph that names a figure/table, or small text hugging a picture."""
    for i, item in enumerate(flow):
        if not _is_para(item) or item.hint or item.marker is not None or len(item.rows) > 4:
            continue
        text = item.text.strip()
        prev = flow[i - 1] if i else None
        nxt = flow[i + 1] if i + 1 < len(flow) else None
        beside_figure = any(
            n is not None
            and not _is_para(n)
            and n[0].__class__.__name__ in ("RawImage", "RawTable")
            and n[1] == item.page
            for n in (prev, nxt)
        )
        named = bool(CAPTION_RE.match(text)) and len(text) <= 300
        small_under_image = (
            prev is not None
            and not _is_para(prev)
            and prev[0].__class__.__name__ == "RawImage"
            and prev[1] == item.page
            and item.size <= body_size - 0.8
            and len(item.rows) <= 2
        )
        if (named and (beside_figure or item.size <= body_size + 0.3)) or small_under_image:
            item.hint = "caption"


def assign_footnotes(
    flow: list, page_heights: dict[int, float], body_size: float, rules_by_page: dict
) -> None:
    """Small marked notes that close a page: under a separator rule, or after a clear gap."""
    by_page: dict[int, list] = {}
    for item in flow:
        if _is_para(item):
            by_page.setdefault(item.page, []).append(item)
    for page, paras in by_page.items():
        height = page_heights.get(page, 792.0)
        notes: list = []
        for p in reversed(paras):
            small = p.size <= body_size - 1.0
            if p.hint or not small:
                break
            notes.append(p)
        while notes and not FOOTNOTE_MARK_RE.match(notes[-1].text.strip()):
            notes.pop()  # the block must begin with a marked note
        if not notes:
            continue
        first = notes[-1]
        top = first.rows[0].y0
        ruled = any(top - 30 <= r.bbox[1] <= top + 2 for r in rules_by_page.get(page, []))
        index = paras.index(first)
        above = paras[index - 1] if index else None
        gap = top - above.rows[-1].y1 if above is not None and above.leaf == first.leaf else 1e9
        # a separator rule settles it; otherwise the notes must sit low on the page after a gap
        if ruled or (top >= 0.5 * height and gap >= 1.5 * body_size):
            for p in notes:
                p.hint = "footnote"
                p.marker = None
                for row in p.rows:
                    row.marker = None


def looks_like_index_column(lines: list) -> bool:
    """A column of index entries ("apple, 3, 5-7"): short ragged lines ending in page numbers."""
    if len(lines) < 6:
        return False
    hits = sum(1 for ln in lines if INDEX_ENTRY_RE.search(ln.text.strip()))
    return hits >= 0.5 * len(lines)
