"""Text fidelity: ToUnicode parsing, ligature expansion, glyph repair, suspicious characters."""

from __future__ import annotations

import pymupdf
import pytest
from docx import Document

from app.conversion import convert_pdf_to_docx
from app.conversion.extract import extract_page
from app.conversion.text_repair import (
    FontCatalog,
    count_suspicious,
    decode_glyph_name,
    expand_ligatures,
    parse_tounicode,
    repair_pages,
)

from .fixtures import NAMED_TEXT, NAMELESS_LINES, PRIVATE, build_font, lig

LIGATURES = ["fi", "fl", "ff", "ffi", "ffl", "ft", "tt"]


def extract(pdf_path, repair=True):
    with pymupdf.open(pdf_path) as pdf:
        catalog = FontCatalog(pdf)
        pages = [extract_page(pdf[i], i, catalog) for i in range(pdf.page_count)]
        quality = repair_pages(pdf, pages) if repair else None
        return [[ln.text for ln in page.lines] for page in pages], quality


def test_parse_tounicode_chars_ranges_and_unmapped_codes():
    cmap = b"""2 beginbfchar
<00B7> <00E9>
<011E> <0000>
endbfchar
3 beginbfrange
<0003> <0005> <0041>
<0119> <011A> <FB01>
<0200> <0201> [<0066006C> <0074>]
endbfrange"""
    mapping = parse_tounicode(cmap)
    assert mapping[0xB7] == "é"
    assert mapping[0x11E] == "\x00"  # explicitly unmapped
    assert [mapping[c] for c in (3, 4, 5)] == ["A", "B", "C"]
    assert (mapping[0x119], mapping[0x11A]) == ("\ufb01", "\ufb02")
    assert (mapping[0x200], mapping[0x201]) == ("fl", "t")


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("f_i", "fi"), ("f_l", "fl"), ("f_f", "ff"), ("f_f_i", "ffi"), ("f_f_l", "ffl"),
        ("f_t", "ft"), ("t_t", "tt"), ("T_h", "Th"), ("uniFB01", "fi"), ("uni00660074", "ft"),
        ("fi", "fi"), ("f_t.liga", "ft"), ("eacute", "é"),
        ("286", None), ("glyph00286", None), ("cid308", None), (".notdef", None), ("", None),
    ],
)  # fmt: skip
def test_decode_glyph_name(name, expected):
    assert decode_glyph_name(name) == expected


def test_expand_presentation_ligatures():
    assert expand_ligatures("o\ufb03ce \ufb02oor \ufb01sh stu\ufb00 ba\ufb04e h\u0133ack") == (
        "office floor fish stuff baffle hijack"
    )


@pytest.mark.parametrize(
    ("text", "count"),
    [
        ("plain ASCII text", 0),
        ("Jürgen Müller from Łódź met Dvořák — café, naïve", 0),
        ("Ɛyɛ adwuma GH₵ 250 ≤ ≥ π", 0),
        ("maĴer and aĞer", 2),  # capitals wedged inside lowercase words: damaged glyphs
        ("replacement \ufffd here", 1),
        ("private \ue005 use", 1),
        ("control \x02 char", 1),
    ],
)
def test_count_suspicious(text, count):
    assert count_suspicious(text) == count


def test_damaged_glyphs_are_visible_before_repair(ligature_pdf):
    pages, _ = extract(ligature_pdf, repair=False)
    raw = " ".join(line for page in pages for line in page)
    assert count_suspicious(raw) > 20
    assert "after" not in raw and "matter" not in raw


def test_named_font_ligatures_are_repaired_from_glyph_names(ligature_pdf):
    pages, quality = extract(ligature_pdf)
    assert pages[0][0] == NAMED_TEXT
    named = {k.split(":", 1)[1]: v for k, v in quality.repaired.items() if ord(k.split(":", 1)[1]) >= 0xE000}
    assert named == {chr(PRIVATE["f_t"]): "ft", chr(PRIVATE["t_t"]): "tt"}


@pytest.mark.parametrize("ligature", LIGATURES)
def test_nameless_unmapped_ligatures_are_repaired_from_context(ligature_pdf, ligature):
    """The font has no glyph names and its ToUnicode maps the glyph to U+0000 (the real-world
    cause of "maĴer"/"aĞer"); only the words can say which ligature it was."""
    pages, quality = extract(ligature_pdf)
    assert pages[1][:3] == NAMELESS_LINES
    contextual = [v for k, v in quality.repaired.items() if ord(k.split(":", 1)[1]) < 0x20]
    assert ligature in contextual
    assert quality.suspicious_chars == 0 and not quality.unresolved


def test_conversion_writes_repaired_text(ligature_pdf, tmp_path):
    out = tmp_path / "lig.docx"
    result = convert_pdf_to_docx(ligature_pdf, out)
    text = "\n".join(p.text for p in Document(str(out)).paragraphs)
    for line in [NAMED_TEXT, *NAMELESS_LINES]:
        assert line in text
    assert count_suspicious(text) == 0
    assert result.quality["suspicious_chars"] == 0
    assert set(result.quality["glyphs_repaired"].values()) == set(LIGATURES)


def test_unresolvable_glyph_is_reported_not_guessed(tmp_path):
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_font(fontname="Bare", fontbuffer=build_font(glyph_names=False, presentation_forms=False))
    page.insert_text((72, 100), lig("xqftzz zzttqx", PRIVATE), fontname="Bare", fontsize=12)
    path = tmp_path / "unknown.pdf"
    doc.save(path)
    pages, quality = extract(path)
    assert quality.repaired == {}
    assert quality.suspicious_chars == 2 and len(quality.unresolved) == 2
    assert "ft" not in pages[0][0]  # nothing was invented
