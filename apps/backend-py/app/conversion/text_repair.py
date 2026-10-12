"""Text fidelity: ligature expansion, repair of unmapped glyphs, suspicious-character checks.

MuPDF already prefers each font's ToUnicode CMap. Corruption appears when that map has no
answer for a glyph: ligatures without a Unicode code point ("tt", "ft", "Th") are commonly
mapped to U+0000 or to the private use area, and MuPDF then falls back to the raw glyph code,
which surfaces as an unrelated letter (glyph 0x134 becomes "Ĵ"). Those glyphs are identified
here from the font's own ToUnicode map and repaired in three tiers:

1. the embedded font's glyph name ("t_t", "f_f_i", "uniFB01"), decoded by the Adobe rules;
2. the candidate ligature that turns the affected words into words the document (or a small
   list of common English words) already contains, filtered by glyph advance width;
3. otherwise the character is left untouched and reported as suspicious.
"""

from __future__ import annotations

import logging
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass, field

import pymupdf

log = logging.getLogger(__name__)

# Presentation-form ligatures with a compatibility decomposition that is plain text.
LIGATURES = {
    "ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl",
    "ﬅ": "st", "ﬆ": "st", "Ĳ": "IJ", "ĳ": "ij",
}  # fmt: skip

# Ligatures fonts ship without a Unicode code point, most frequent first.
CANDIDATE_LIGATURES = (
    "ft", "tt", "Th", "fi", "fl", "ff", "ffi", "ffl", "fj", "ct", "st", "fb", "fh", "fk",
    "ffj", "fft", "tf", "tti", "ch", "ck", "sp", "ffb", "ffh", "ffk", "ty", "Qu",
)  # fmt: skip

# Fallback vocabulary for documents too small (or too uniform) to vote from their own words.
COMMON_WORDS = frozenset(
    """
    after often left soft gift lift draft craft shift swift theft drift loft software afternoon
    better letter matter little pretty bottom attack attention getting putting sitting written
    forgotten latter pattern button cotton butter bitter settle battle bottle kettle cattle
    attempt attend attitude attract committee submitted admitted permitted setting cutting
    the then there this that they them their these those than thus though through three think
    thing things thought thank thanks
    first find five final finally fine finish fire field figure file fill film fix define defined
    office official efficient difficult sufficient coefficient traffic affirm
    different difference effect effort offer off stuff staff afford suffer coffee differ
    fly floor flat flow flag flight float reflect influence conflict flexible
    affluent baffle shuffle waffle raffle
    fact act exact direct effect object subject project protect expect perfect select
    just most must last best test still state street start story stand step stop study
    fjord
    """.split()
)

_SUBSET_PREFIX = re.compile(r"^[A-Z]{6}\+")
_NAMELESS = re.compile(r"^(?:\.notdef|\d+|(?:glyph|gid|cid|index|g|c|char)[_-]?\d+)$", re.I)
_UNI = re.compile(r"^uni((?:[0-9A-F]{4})+)$")
_U = re.compile(r"^u([0-9A-F]{4,6})$")
_WORD = re.compile(r"[^\W\d_]+(?:['’][^\W\d_]+)*", re.UNICODE)
_BLOCK = {
    "char": re.compile(rb"beginbfchar(.*?)endbfchar", re.S),
    "range": re.compile(rb"beginbfrange(.*?)endbfrange", re.S),
}
_HEX = re.compile(rb"<([0-9A-Fa-f]*)>|(\[)|(\])")


def expand_ligatures(text: str) -> str:
    if not any(ch in LIGATURES for ch in text):
        return text
    return "".join(LIGATURES.get(ch, ch) for ch in text)


def is_suspicious_char(ch: str) -> bool:
    """Replacement, private-use, unassigned, surrogate or control characters."""
    if ch in "\t\n\r":
        return False
    return ch == "�" or unicodedata.category(ch) in ("Co", "Cn", "Cs", "Cc")


def _unexpected_in_word(text: str, i: int) -> bool:
    """A non-ASCII capital wedged between lowercase letters ("maĴer") is a damaged glyph."""
    ch = text[i]
    if ord(ch) < 0x80 or not ch.isupper():
        return False
    return 0 < i < len(text) - 1 and text[i - 1].islower() and text[i + 1].islower()


def count_suspicious(text: str) -> int:
    return sum(1 for i, ch in enumerate(text) if is_suspicious_char(ch) or _unexpected_in_word(text, i))


def find_suspicious(text: str, limit: int = 10) -> list[str]:
    """Short excerpts around suspicious characters, for reports."""
    out: list[str] = []
    for i, ch in enumerate(text):
        if is_suspicious_char(ch) or _unexpected_in_word(text, i):
            out.append(text[max(0, i - 12) : i + 12].replace("\n", " "))
            if len(out) >= limit:
                break
    return out


_BASIC_NAMES = {"fi": 0xFB01, "fl": 0xFB02, "ff": 0xFB00, "ffi": 0xFB03, "ffl": 0xFB04, "space": 0x20}


def _glyph_list_lookup(part: str) -> int | None:
    """Unicode for one Adobe Glyph List name ("eacute", "f", "fi")."""
    if len(part) == 1:
        return ord(part)
    if part in _BASIC_NAMES:
        return _BASIC_NAMES[part]
    try:
        # MuPDF's own table; the pymupdf wrapper only answers after a Font has been created
        code = pymupdf.mupdf.fz_unicode_from_glyph_name(part)
    except Exception:  # noqa: BLE001
        return None
    return None if code in (0, 0xFFFD) else code


def decode_glyph_name(name: str) -> str | None:
    """Text for a glyph name per the Adobe Glyph List conventions; None when it says nothing."""
    base = (name or "").split(".")[0]
    if not base or _NAMELESS.match(base):
        return None
    out: list[str] = []
    for part in base.split("_"):
        m = _UNI.match(part)
        if m:
            out += [chr(int(m.group(1)[i : i + 4], 16)) for i in range(0, len(m.group(1)), 4)]
            continue
        m = _U.match(part)
        if m:
            out.append(chr(int(m.group(1), 16)))
            continue
        code = _glyph_list_lookup(part)
        if code is None:
            return None
        out.append(chr(code))
    text = expand_ligatures("".join(out))
    if not text or any(is_suspicious_char(ch) for ch in text):
        return None
    return text


def parse_tounicode(stream: bytes) -> dict[int, str]:
    """Map character codes to Unicode strings from a ToUnicode CMap stream."""

    def text(hex_bytes: bytes) -> str:
        digits = hex_bytes.decode("ascii")
        raw = bytes.fromhex(digits.zfill(-(-len(digits) // 4) * 4))
        return raw.decode("utf-16-be", errors="replace")

    mapping: dict[int, str] = {}
    for block in _BLOCK["char"].findall(stream):
        tokens = [m.group(1) for m in _HEX.finditer(block) if m.group(1) is not None]
        for src, dst in zip(tokens[0::2], tokens[1::2]):
            if src:
                mapping[int(src, 16)] = text(dst) if dst else ""
    for block in _BLOCK["range"].findall(stream):
        tokens = list(_HEX.finditer(block))
        i = 0
        while i + 2 < len(tokens):
            lo, hi = tokens[i].group(1), tokens[i + 1].group(1)
            if not lo or not hi:
                break
            lo_i, hi_i = int(lo, 16), int(hi, 16)
            if tokens[i + 2].group(2):  # <lo> <hi> [<a> <b> ...]
                j = i + 3
                code = lo_i
                while j < len(tokens) and not tokens[j].group(3):
                    mapping[code] = text(tokens[j].group(1) or b"")
                    code += 1
                    j += 1
                i = j + 1
            else:
                dst = tokens[i + 2].group(1) or b""
                first = text(dst) if dst else ""
                if first.strip("\x00") == "":
                    first = ""  # a range mapped to U+0000 names nothing
                for offset in range(min(hi_i - lo_i, 0xFFFF) + 1):
                    if first:
                        mapping[lo_i + offset] = first[:-1] + chr(ord(first[-1]) + offset)
                    else:
                        mapping[lo_i + offset] = ""
                i += 3
    return mapping


@dataclass(slots=True)
class FontInfo:
    xref: int
    name: str
    identity: bool
    mapping: dict[int, str] | None
    font: pymupdf.Font | None
    _outputs: set[str] | None = None

    def is_unmapped(self, ch: str) -> bool:
        """True when `ch` is MuPDF's raw-code fallback rather than a real mapping."""
        if is_suspicious_char(ch):
            return True
        return self._is_raw_code(ch)

    def _is_raw_code(self, ch: str) -> bool:
        """`ch` is the glyph code itself: its ToUnicode entry is empty and no other code maps
        to this character (the fallback can land anywhere, including on ASCII)."""
        if not self.identity or self.mapping is None:
            return False
        if self.mapping.get(ord(ch), "x") not in ("", "\x00"):
            return False
        if self._outputs is None:
            self._outputs = {v for v in self.mapping.values() if v not in ("", "\x00")}
        return ch not in self._outputs

    def glyph_id(self, ch: str) -> int:
        if self.font is None:
            return 0
        if not self.identity:
            return self.font.has_glyph(ord(ch))
        return ord(ch) if self._is_raw_code(ch) else self.code_for(ch)

    def glyph_name(self, ch: str) -> str | None:
        gid = self.glyph_id(ch)
        if not gid:
            return None
        try:
            return pymupdf.mupdf.fz_get_glyph_name2(self.font.this, gid)
        except Exception:  # noqa: BLE001 - nameless or damaged font program
            return None

    def advance(self, gid: int) -> float:
        try:
            return pymupdf.mupdf.fz_advance_glyph(self.font.this, gid, 0) if self.font and gid else 0.0
        except Exception:  # noqa: BLE001
            return 0.0

    def code_for(self, ch: str) -> int:
        """Glyph id of an ordinary character (used to measure ligature components)."""
        if self.font is None:
            return 0
        if not self.identity:
            return self.font.has_glyph(ord(ch))
        for code, text in (self.mapping or {}).items():
            if text == ch:
                return code
        return 0


class FontCatalog:
    """Lazily loaded per-xref font facts for one document."""

    def __init__(self, pdf: pymupdf.Document) -> None:
        self._pdf = pdf
        self._cache: dict[int, FontInfo] = {}

    def page_fonts(self, page: pymupdf.Page) -> dict[str, int]:
        """Span font name -> xref for the fonts used on a page."""
        out: dict[str, int] = {}
        try:
            for entry in page.get_fonts(full=True):
                out.setdefault(_SUBSET_PREFIX.sub("", entry[3]), entry[0])
        except Exception:  # noqa: BLE001
            pass
        return out

    def get(self, xref: int) -> FontInfo | None:
        if xref <= 0:
            return None
        if xref not in self._cache:
            self._cache[xref] = self._load(xref)
        return self._cache[xref]

    def _load(self, xref: int) -> FontInfo:
        pdf = self._pdf
        name, identity, mapping, font = "", False, None, None
        try:
            name = _SUBSET_PREFIX.sub("", pdf.xref_get_key(xref, "BaseFont")[1].lstrip("/"))
            identity = "Identity" in pdf.xref_get_key(xref, "Encoding")[1]
            kind, value = pdf.xref_get_key(xref, "ToUnicode")
            if kind == "xref":
                mapping = parse_tounicode(pdf.xref_stream(int(value.split()[0])) or b"")
            buffer = pdf.extract_font(xref)[3]
            if buffer:
                font = pymupdf.Font(fontbuffer=buffer)
        except Exception:  # noqa: BLE001 - a font we cannot inspect is simply not repairable
            log.debug("Font %s could not be inspected", xref, exc_info=True)
        return FontInfo(xref, name, identity, mapping, font)


@dataclass(slots=True)
class TextQuality:
    repaired: dict[str, str] = field(default_factory=dict)  # "Font:Ĵ" -> "tt"
    repaired_chars: int = 0
    ligatures_expanded: int = 0
    unresolved: dict[str, int] = field(default_factory=dict)
    suspicious_chars: int = 0  # still present after repair
    samples: list[str] = field(default_factory=list)


def _iter_span_lists(pages):
    for page in pages:
        for line in page.lines:
            yield line.spans
        for table in page.tables:
            for cell in table.cells:
                yield from cell.spans


def repair_pages(pdf: pymupdf.Document | None, pages) -> TextQuality:
    """Expand ligatures and repair unmapped glyphs in place; report what remains suspicious."""
    quality = TextQuality()
    catalog = FontCatalog(pdf) if pdf is not None else None

    # ---- pass 1: ligatures, vocabulary, and the words each unmapped glyph occurs in
    vocab: Counter[str] = Counter()
    words_by_key: dict[tuple[str, str], Counter[str]] = {}
    info_by_key: dict[tuple[str, str], FontInfo | None] = {}
    occurrences: Counter[tuple[str, str]] = Counter()
    for spans in _iter_span_lists(pages):
        text_parts: list[str] = []
        keys: list[tuple[str, str] | None] = []
        for span in spans:
            info = catalog.get(span.xref) if catalog else None
            for ch in span.chars:
                key = None
                if ch.c in LIGATURES:
                    ch.c = LIGATURES[ch.c]
                    quality.ligatures_expanded += 1
                elif len(ch.c) == 1 and (
                    is_suspicious_char(ch.c) or (info is not None and info.is_unmapped(ch.c))
                ):
                    key = (span.font, ch.c)
                    info_by_key.setdefault(key, info)
                    occurrences[key] += 1
                text_parts.append(ch.c)
                keys.extend([key] * len(ch.c))
        text = "".join(text_parts)
        start = None
        for i in range(len(text) + 1):
            inside = i < len(text) and (keys[i] is not None or text[i].isalpha() or text[i] in "'’")
            if inside and start is None:
                start = i
            elif not inside and start is not None:
                word, found = text[start:i], {k for k in keys[start:i] if k}
                if not found:
                    vocab[word.strip("'’").lower()] += 1
                elif len(found) == 1:
                    words_by_key.setdefault(next(iter(found)), Counter())[word] += 1
                start = None

    # ---- pass 2: decide a replacement per (font, glyph)
    replacements: dict[tuple[str, str], str] = {}
    for key, info in info_by_key.items():
        fixed = decode_glyph_name(info.glyph_name(key[1]) or "") if info is not None else None
        if (fixed is None or fixed == key[1]) and info is not None:
            fixed = _vote(key[1], info, words_by_key.get(key, Counter()), vocab)
        if fixed == key[1]:
            fixed = None
        if not fixed and unicodedata.category(key[1]) == "Cc":
            # A control code is never text: it is an unnamed symbol-font glyph (an ornament or
            # list bullet). Keep its place with a bullet rather than dropping it silently.
            fixed = "\u2022"
        if fixed:
            replacements[key] = fixed
            quality.repaired[f"{key[0]}:{key[1]}"] = fixed
        else:
            quality.unresolved[f"{key[0]}:U+{ord(key[1]):04X}"] = occurrences[key]

    # ---- pass 3: apply, then count what is still suspicious
    for spans in _iter_span_lists(pages):
        for span in spans:
            for ch in span.chars:
                fixed = replacements.get((span.font, ch.c))
                if fixed is not None:
                    ch.c = fixed
                    quality.repaired_chars += 1
        text = "".join(ch.c for span in spans for ch in span.chars)
        n = count_suspicious(text)
        if n:
            quality.suspicious_chars += n
            if len(quality.samples) < 10:
                quality.samples += find_suspicious(text, 10 - len(quality.samples))
    if quality.repaired:
        log.info(
            "Repaired unmapped glyphs", extra={"glyphs": quality.repaired, "chars": quality.repaired_chars}
        )
    if quality.suspicious_chars:
        log.warning(
            "Suspicious characters remain after text repair",
            extra={
                "count": quality.suspicious_chars,
                "unresolved": quality.unresolved,
                "samples": quality.samples[:5],
            },
        )
    return quality


def _vote(ch: str, info: FontInfo, words: Counter[str], vocab: Counter[str]) -> str | None:
    """Pick the ligature that makes the words containing `ch` real words."""
    if not words:
        return None
    mapped = set((info.mapping or {}).values())
    glyph_width = info.advance(info.glyph_id(ch))
    scores: list[tuple[int, int, str]] = []
    for rank, cand in enumerate(CANDIDATE_LIGATURES):
        # a ligature this font already maps properly is not the unmapped one
        presentation = next((k for k, v in LIGATURES.items() if v == cand), None)
        if presentation and presentation in mapped:
            continue
        if glyph_width:
            parts = [info.advance(info.code_for(c)) for c in cand]
            if all(parts) and abs(glyph_width - sum(parts)) > 0.15 * sum(parts):
                continue
        hits = 0
        for word in words:
            fixed = word.replace(ch, cand).strip("'’").lower()
            if fixed in vocab or fixed in COMMON_WORDS:
                hits += 1
        if hits:
            scores.append((hits, -rank, cand))
    if not scores:
        return None
    scores.sort(reverse=True)
    best = scores[0]
    runner_up = scores[1][0] if len(scores) > 1 else 0
    needed = max(1, round(0.3 * len(words)))
    if best[0] >= needed and (best[0] > runner_up):
        return best[2]
    return None
