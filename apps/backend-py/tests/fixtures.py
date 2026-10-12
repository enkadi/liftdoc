"""Deterministic PDF fixtures built with PyMuPDF (and fontTools for the ligature font).

`build_book` produces a small book that exercises the layout features real books use:
full-bleed cover, centred front matter, contents rows with dot leaders, running head and
folio, chapter heading, justified prose with first-line indents, footnote under a rule,
figure with caption, a picture with text wrapped beside it, block quotation, two-column
index, and end matter.

`build_ligatures` embeds a purpose-built font whose ligature glyphs are mapped the three
ways they go wrong in the wild.
"""

from __future__ import annotations

import io
from pathlib import Path

import pymupdf

LOREM = (
    "The orchard keeps its own calendar and the pickers learn to read it slowly. Each row "
    "ripens in a different week, so the ladders move across the hill like the hands of a clock. "
    "By the end of the season the sheds are full and the ledgers finally agree with the trees."
)
W, H = 612.0, 792.0
LEFT, RIGHT = 72.0, 540.0


def _png(width: int, height: int, colours: list[tuple[int, int, int]]) -> bytes:
    pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, width, height), False)
    band = height // len(colours)
    for i, colour in enumerate(colours):
        y1 = height if i == len(colours) - 1 else (i + 1) * band
        pix.set_rect(pymupdf.IRect(0, i * band, width, y1), colour)
    return pix.tobytes("png")


class Typesetter:
    def __init__(self, page: pymupdf.Page) -> None:
        self.page = page

    def text(self, x: float, baseline: float, text: str, size=11.0, font="tiro", color=(0, 0, 0)) -> float:
        self.page.insert_text((x, baseline), text, fontsize=size, fontname=font, color=color)
        return pymupdf.get_text_length(text, fontname=font, fontsize=size)

    def centred(self, baseline: float, text: str, size=11.0, font="tiro", color=(0, 0, 0)) -> None:
        width = pymupdf.get_text_length(text, fontname=font, fontsize=size)
        self.text((W - width) / 2, baseline, text, size, font, color)

    def paragraph(
        self, baseline: float, text: str, *, size=11.0, leading=14.0, font="tiro",
        left=LEFT, right=RIGHT, indent=0.0, justify=True,
    ) -> float:  # fmt: skip
        """Set a paragraph line by line; returns the baseline for whatever follows."""
        space = pymupdf.get_text_length(" ", fontname=font, fontsize=size)
        lines: list[list[str]] = [[]]
        x = left + indent
        for word in text.split():
            width = pymupdf.get_text_length(word, fontname=font, fontsize=size)
            if lines[-1] and x + width > right:
                lines.append([])
                x = left
            lines[-1].append(word)
            x += width + space
        for n, words in enumerate(lines):
            start = left + (indent if n == 0 else 0.0)
            last = n == len(lines) - 1
            if justify and not last and len(words) > 1:
                natural = sum(pymupdf.get_text_length(w, fontname=font, fontsize=size) for w in words)
                gap = (right - start - natural) / (len(words) - 1)
                cursor = start
                for w in words:
                    cursor += self.text(cursor, baseline, w, size, font) + gap
            else:
                self.text(start, baseline, " ".join(words), size, font)
            baseline += leading
        return baseline


def _furniture(page: pymupdf.Page, number: int) -> None:
    ts = Typesetter(page)
    ts.text(LEFT, 44, "The Orchard Years", 8, "helv")
    ts.centred(H - 36, str(number), 8, "helv")


def build_book(path: Path) -> Path:
    doc = pymupdf.open()

    # 1 - cover: full-bleed picture with the title set over it
    page = doc.new_page(width=W, height=H)
    page.insert_image(
        page.rect, stream=_png(153, 198, [(28, 60, 44), (60, 110, 70), (190, 150, 60)]), keep_proportion=False
    )
    ts = Typesetter(page)
    ts.centred(300, "THE ORCHARD YEARS", 34, "hebo", (1, 1, 1))
    ts.centred(340, "A Season-by-Season Memoir", 16, "helv", (1, 1, 1))
    ts.centred(700, "Ama Boateng", 18, "helv", (1, 1, 1))

    # 2 - front matter: centred, intentionally short lines
    page = doc.new_page(width=W, height=H)
    ts = Typesetter(page)
    y = 220.0
    for group in (
        ["The Orchard Years is a work of nonfiction."],
        ["Copyright 2024 by Ama Boateng", "All rights reserved."],
        ["Published by Hillside Press, Kumasi.", "First edition."],
        ["ISBN 978-0-00-000000-0"],
    ):
        for line in group:
            ts.centred(y, line, 10)
            y += 13
        y += 9

    # 3 - contents with dot leaders and right-aligned page numbers
    page = doc.new_page(width=W, height=H)
    ts = Typesetter(page)
    ts.centred(110, "Contents", 20, "tibo")
    y = 160.0
    for title, number, indent in (
        ("Chapter 1: The First Harvest", "4", 0), ("Chapter 2: Winter Pruning", "6", 0),
        ("Notes on the ledgers", "6", 18), ("Index", "7", 0), ("About the Author", "8", 0),
    ):  # fmt: skip
        used = ts.text(LEFT + indent, y, title, 11)
        num_w = pymupdf.get_text_length(number, fontname="tiro", fontsize=11)
        dot_w = pymupdf.get_text_length(". ", fontname="tiro", fontsize=11)
        dots = int((RIGHT - num_w - 8 - (LEFT + indent + used + 6)) / dot_w)
        ts.text(LEFT + indent + used + 6, y, ". " * dots, 11)
        ts.text(RIGHT - num_w, y, number, 11)
        y += 18

    # 4 - chapter opening, justified prose, footnote under a rule
    page = doc.new_page(width=W, height=H)
    _furniture(page, 4)
    ts = Typesetter(page)
    ts.centred(120, "Chapter 1", 12, "tiro")
    ts.centred(150, "The First Harvest", 18, "tibo")
    y = 200.0
    for n in range(4):
        y = ts.paragraph(y, LOREM + " " + LOREM, indent=0 if n == 0 else 14)
    mark_x = (
        LEFT + 14 + pymupdf.get_text_length("The ledgers were kept in pencil.", fontname="tiro", fontsize=11)
    )
    ts.text(mark_x, y - 4, "1", 7)  # superscript footnote reference on the first line
    y = ts.paragraph(y, "The ledgers were kept in pencil.  " + LOREM, indent=14)
    page.draw_line((LEFT, 690), (LEFT + 120, 690), width=0.5)
    ts.paragraph(
        703,
        "1 The pencil ledgers survive in the packing shed; ink was thought unlucky.",
        size=8,
        leading=10,
        justify=False,
    )

    # 5 - figure with caption, then a picture with text wrapped beside it
    page = doc.new_page(width=W, height=H)
    _furniture(page, 5)
    ts = Typesetter(page)
    y = ts.paragraph(90, LOREM, indent=14)
    page.insert_image(
        pymupdf.Rect(156, y, 456, y + 150), stream=_png(300, 150, [(200, 220, 240), (120, 160, 210)])
    )
    ts.centred(y + 164, "Figure 1: Yield by season across the lower rows.", 9, "tiit")
    y = ts.paragraph(y + 190, LOREM + " " + LOREM, indent=14)
    page.insert_image(
        pymupdf.Rect(390, y - 8, RIGHT, y + 142), stream=_png(150, 150, [(230, 200, 160), (200, 120, 80)])
    )
    # the picture is as tall as the paragraph set beside it, so every line of it is narrowed
    y = ts.paragraph(y, LOREM + " " + LOREM, right=376, indent=14)
    ts.paragraph(max(y, y + 0), LOREM, indent=14)

    # 6 - second chapter: block quotation and a bulleted list, footnote-sized note section head
    page = doc.new_page(width=W, height=H)
    _furniture(page, 6)
    ts = Typesetter(page)
    ts.centred(120, "Chapter 2", 12, "tiro")
    ts.centred(150, "Winter Pruning", 18, "tibo")
    y = ts.paragraph(200, LOREM)
    y = ts.paragraph(y + 8, LOREM, left=108, right=504, size=10, leading=13)
    y = ts.paragraph(y + 8, LOREM, indent=14)
    ts.text(LEFT, y + 22, "Notes on the ledgers", 13, "tibo")
    y += 44
    for item in ("Count the crates before noon", "Weigh every tenth crate", "Sign the page at dusk"):
        ts.text(LEFT + 6, y, "•", 11)
        ts.text(LEFT + 22, y, item, 11)
        y += 16

    # 7 - index in two columns
    page = doc.new_page(width=W, height=H)
    _furniture(page, 7)
    ts = Typesetter(page)
    ts.centred(110, "Index", 20, "tibo")
    entries = [
        "apples, 4, 5", "baskets, 4", "crates, 5, 6", "dusk, 6", "frost, 4, 6", "grafting, 5",
        "harvest, 4-6", "ladders, 4", "ledgers, 4, 6", "orchard, 4-8", "pencils, 4", "pickers, 4, 5",
        "pruning, 6", "rows, 4, 5", "seasons, 5", "sheds, 4", "trees, 4-6", "weighing, 6",
        "winter, 6", "yield, 5",
    ]  # fmt: skip
    half = len(entries) // 2
    for col, x in enumerate((LEFT, 320.0)):
        y = 160.0
        for entry in entries[col * half : (col + 1) * half]:
            ts.text(x, y, entry, 9)
            y += 12

    # 8 - end matter
    page = doc.new_page(width=W, height=H)
    _furniture(page, 8)
    ts = Typesetter(page)
    ts.centred(130, "About the Author", 18, "tibo")
    y = ts.paragraph(180, "Ama Boateng grew up among the orchards she writes about. " + LOREM)
    ts.centred(y + 60, "Set in Times and printed in Kumasi.", 9, "tiit")
    ts.centred(y + 73, "Hillside Press", 9, "tiit")

    doc.save(path)
    doc.close()
    return path


# ------------------------------------------------------------------ ligature font

LIGATURE_GLYPHS = {
    "f_i": "fi", "f_l": "fl", "f_f": "ff", "f_f_i": "ffi", "f_f_l": "ffl", "f_t": "ft", "t_t": "tt",
}  # fmt: skip
PRESENTATION = {"f_i": 0xFB01, "f_l": 0xFB02, "f_f": 0xFB00, "f_f_i": 0xFB03, "f_f_l": 0xFB04}
PRIVATE = {name: 0xE000 + i for i, name in enumerate(LIGATURE_GLYPHS)}


def build_font(*, glyph_names: bool, presentation_forms: bool) -> bytes:
    """A box-glyph TrueType font: letters plus ligature glyphs mapped in the private use area
    (and optionally at the Unicode presentation forms)."""
    from fontTools.fontBuilder import FontBuilder
    from fontTools.pens.ttGlyphPen import TTGlyphPen

    letters = "abcdefghijklmnopqrstuvwxyzT"
    names = {".notdef": None, "space": 0x20, "period": 0x2E, "comma": 0x2C}
    names.update({ch: ord(ch) for ch in letters})
    # Ligatures take the first glyph ids so an unmapped one never collides with the code of
    # a character the font really produces (which would be undecidable, and is not what real
    # fonts do: their ligatures sit at high glyph ids).
    order = [".notdef", *LIGATURE_GLYPHS, *(n for n in names if n != ".notdef")]
    cmap = {code: name for name, code in names.items() if code}
    for name, code in PRIVATE.items():
        cmap[code] = name
    if presentation_forms:
        for name, code in PRESENTATION.items():
            cmap[code] = name

    def box(width: int):
        pen = TTGlyphPen(None)
        if width:
            pen.moveTo((50, 0))
            pen.lineTo((50, 500))
            pen.lineTo((width - 50, 500))
            pen.lineTo((width - 50, 0))
            pen.closePath()
        return pen.glyph()

    widths = {name: 500 for name in order}
    widths["space"] = 250
    for name, text in LIGATURE_GLYPHS.items():
        widths[name] = 500 * len(text)
    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf({name: box(0 if name == "space" else widths[name]) for name in order})
    fb.setupHorizontalMetrics({name: (widths[name], 50) for name in order})
    fb.setupHorizontalHeader(ascent=800, descent=-200)
    fb.setupNameTable({"familyName": "DocLiftLig", "styleName": "Regular"})
    fb.setupOS2(sTypoAscender=800, usWinAscent=800, usWinDescent=200)
    fb.setupPost(keepGlyphNames=glyph_names)
    buffer = io.BytesIO()
    fb.save(buffer)
    return buffer.getvalue()


def lig(text: str, table: dict[str, int]) -> str:
    """Replace letter sequences by the ligature code points of `table` (longest first)."""
    for name in sorted(LIGATURE_GLYPHS, key=lambda n: -len(LIGATURE_GLYPHS[n])):
        if name in table:
            text = text.replace(LIGATURE_GLYPHS[name], chr(table[name]))
    return text


NAMED_TEXT = "office affluent floor fluffy baffle after left matter better"
NAMELESS_LINES = [
    "first find office different floor flat stuff offer",
    "baffle waffle after left often better matter little",
    "the staff left the office after the first shift",
]
PLAIN_TEXT = "plain text in a standard font keeps the vocabulary honest"


def build_ligatures(path: Path) -> Path:
    """Three ways ligatures reach a PDF:

    * page 1, named font - presentation forms (fi fl ff ffi ffl) and private-use code points
      for ft/tt, with glyph names intact;
    * page 2, nameless font - every ligature unmapped (ToUnicode -> U+0000), no glyph names:
      only the words themselves can tell what the glyph was.
    """
    doc = pymupdf.open()
    named = build_font(glyph_names=True, presentation_forms=True)
    nameless = build_font(glyph_names=False, presentation_forms=False)

    page = doc.new_page(width=W, height=H)
    page.insert_font(fontname="LigNamed", fontbuffer=named)
    table = {**PRIVATE, **PRESENTATION}
    page.insert_text((72, 120), lig(NAMED_TEXT, table), fontname="LigNamed", fontsize=12)
    page.insert_text((72, 160), PLAIN_TEXT, fontname="helv", fontsize=11)

    page = doc.new_page(width=W, height=H)
    page.insert_font(fontname="LigBare", fontbuffer=nameless)
    y = 120.0
    for line in NAMELESS_LINES:
        page.insert_text((72, y), lig(line, PRIVATE), fontname="LigBare", fontsize=12)
        y += 24
    page.insert_text((72, y + 20), PLAIN_TEXT, fontname="helv", fontsize=11)

    buffer = doc.tobytes()
    doc.close()
    doc = pymupdf.open(stream=buffer, filetype="pdf")
    # The nameless font (page 2) loses its ligature mappings the way real producers write
    # them: the ToUnicode entry exists but points at U+0000.
    from app.conversion.text_repair import parse_tounicode

    private = {chr(c) for c in PRIVATE.values()}
    for entry in doc[1].get_fonts(full=True):
        kind, value = doc.xref_get_key(entry[0], "ToUnicode")
        if kind != "xref":
            continue
        cmap_xref = int(value.split()[0])
        mapping = parse_tounicode(doc.xref_stream(cmap_xref))
        if not any(v in private for v in mapping.values()):
            continue
        rows = "\n".join(
            f"<{code:04X}> <{0 if text in private else ord(text):04X}>"
            for code, text in sorted(mapping.items())
            if text
        )
        cmap = (
            "/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n"
            "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n"
            "/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n"
            "1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n"
            f"{len(mapping)} beginbfchar\n{rows}\nendbfchar\nendcmap\n"
            "CMapName currentdict /CMap defineresource pop\nend\nend\n"
        )
        doc.update_stream(cmap_xref, cmap.encode("latin1"))
    doc.save(path)
    doc.close()
    return path
