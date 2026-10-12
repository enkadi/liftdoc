"""Reusable Word paragraph styles derived from the formatting that repeats in the source.

Without this every paragraph would be "Normal" plus direct formatting. Body paragraphs are
grouped by their dominant font, size, weight, alignment, indents and leading: the most common
combination becomes "Body Text", other recurring ones "Body Text 2..n"; one-off combinations
fall back to the nearest style with direct overrides. Semantic kinds get their own named
styles (Caption, Footnote Text, TOC 1-3, Index 1).
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass

from docx.enum.style import WD_STYLE_TYPE
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.shared import Pt

from .model import DocumentModel, Paragraph

ALIGN = {
    "left": WD_ALIGN_PARAGRAPH.LEFT,
    "center": WD_ALIGN_PARAGRAPH.CENTER,
    "right": WD_ALIGN_PARAGRAPH.RIGHT,
    "justify": WD_ALIGN_PARAGRAPH.JUSTIFY,
}
SEMANTIC_STYLES = {"caption": "Caption", "footnote": "Footnote Text", "index": "Index 1"}
MIN_USES = 3
MAX_GENERATED = 12


@dataclass(frozen=True, slots=True)
class StyleKey:
    font: str
    size: float
    bold: bool
    italic: bool
    align: str
    indent_left: float
    first_indent: float
    pitch: float | None


def dominant_format(para: Paragraph, model: DocumentModel) -> tuple[str, float, bool, bool]:
    """Font, size, bold, italic covering most of a paragraph's characters."""
    weights: Counter = Counter()
    for run in para.runs:
        n = len(run.text.strip())
        if n and not (run.superscript or run.subscript):
            weights[(run.font or model.body_font, run.size or para.size, run.bold, run.italic)] += n
    if not weights:
        return model.body_font, para.size or model.body_size, False, False
    font, size, bold, italic = weights.most_common(1)[0][0]
    return font, round(size * 2) / 2, bold, italic


class StyleBook:
    def __init__(self, doc, model: DocumentModel, set_font) -> None:
        self.doc = doc
        self.model = model
        self._set_font = set_font
        self._styles: dict[StyleKey, str] = {}
        self._semantic: dict[str, StyleKey] = {}
        self._pitch_by_size: dict[float, float] = {}
        paragraphs = [b for b in model.iter_blocks() if isinstance(b, Paragraph) and b.runs]

        pitches: dict[float, Counter] = {}
        for p in paragraphs:
            if p.line_pitch:
                pitches.setdefault(round(p.size * 2) / 2, Counter())[round(p.line_pitch * 2) / 2] += 1
        self._pitch_by_size = {size: c.most_common(1)[0][0] for size, c in pitches.items()}

        body = Counter(self.key(p) for p in paragraphs if p.kind == "body")
        ranked = [
            k for k, n in body.most_common(MAX_GENERATED) if n >= MIN_USES or k == body.most_common(1)[0][0]
        ]
        for index, key in enumerate(ranked):
            name = "Body Text" if index == 0 else f"Body Text {index + 1}"
            self._define(name, key)
            self._styles[key] = name

        for kind, name in SEMANTIC_STYLES.items():
            keys = Counter(self.key(p) for p in paragraphs if p.kind == kind)
            if keys:
                self._semantic[name] = keys.most_common(1)[0][0]
                self._define(name, self._semantic[name])
        for level in (1, 2, 3):
            keys = Counter(self.key(p) for p in paragraphs if p.kind == "toc" and p.level == level)
            if keys:
                name = f"TOC {level}"
                self._semantic[name] = keys.most_common(1)[0][0]
                self._define(name, self._semantic[name], right_tab=True)

    def key(self, para: Paragraph) -> StyleKey:
        font, size, bold, italic = dominant_format(para, self.model)
        pitch = para.line_pitch or self._pitch_by_size.get(round(para.size * 2) / 2)
        return StyleKey(
            font, size, bold, italic, para.align,
            round(para.indent_left), round(para.first_indent),
            round(pitch * 2) / 2 if pitch else None,
        )  # fmt: skip

    def _define(self, name: str, key: StyleKey, right_tab: bool = False) -> None:
        styles = self.doc.styles
        try:
            style = styles[name]
        except KeyError:
            style = styles.add_style(name, WD_STYLE_TYPE.PARAGRAPH)
            style.base_style = styles["Normal"]
        style.hidden = False
        style.quick_style = True
        self._set_font(style, key.font, key.size, key.bold, key.italic)
        pf = style.paragraph_format
        pf.alignment = ALIGN[key.align]
        pf.left_indent = Pt(key.indent_left)
        pf.first_line_indent = Pt(key.first_indent)
        pf.space_before = Pt(0)
        pf.space_after = Pt(0)
        pf.keep_with_next = False
        apply_pitch(pf, key.pitch, key.size)
        if right_tab:
            from docx.enum.text import WD_TAB_ALIGNMENT, WD_TAB_LEADER

            width = (
                self.model.sections[0].width
                - self.model.sections[0].margin_left
                - self.model.sections[0].margin_right
            )
            pf.tab_stops.add_tab_stop(Pt(width), WD_TAB_ALIGNMENT.RIGHT, WD_TAB_LEADER.DOTS)

    def resolve(self, para: Paragraph) -> tuple[str, StyleKey]:
        """Style name for a body/semantic paragraph, and the formatting that style provides."""
        key = self.key(para)
        if para.kind == "toc":
            name = f"TOC {min(max(para.level, 1), 3)}"
            return (name, self._semantic[name]) if name in self._semantic else ("Normal", self._neutral())
        if para.kind in SEMANTIC_STYLES:
            name = SEMANTIC_STYLES[para.kind]
            return name, self._semantic[name]
        if key in self._styles:
            return self._styles[key], key
        # one-off formatting: reuse the style sharing font and size, override the rest directly
        for known, name in self._styles.items():
            if (known.font, known.size, known.bold, known.italic) == (
                key.font,
                key.size,
                key.bold,
                key.italic,
            ):
                return name, known
        return "Normal", self._neutral()

    def _neutral(self) -> StyleKey:
        return StyleKey(self.model.body_font, self.model.body_size, False, False, "left", 0, 0, None)


def apply_pitch(paragraph_format, pitch: float | None, size: float) -> None:
    """Reproduce the source leading as an "at least" line height (never clips tall glyphs)."""
    if pitch and pitch >= 0.9 * size:
        paragraph_format.line_spacing = Pt(round(pitch * 2) / 2)
        paragraph_format.line_spacing_rule = WD_LINE_SPACING.AT_LEAST
