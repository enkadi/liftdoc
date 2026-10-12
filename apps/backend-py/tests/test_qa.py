"""Conversion QA: programmatic checks always, visual regression when a renderer exists.

A conversion must not count as successful just because the DOCX opens: these tests assert
that the QA report is clean for good output and that it flags real damage.
"""

from __future__ import annotations

import pymupdf
import pytest

from app.conversion import convert_pdf_to_docx, pipeline
from app.conversion.text_repair import TextQuality
from app.qa import analyse, docx_to_pdf, find_renderer
from app.qa.report import (
    _coverage,
    _page_text_match,
    _size_mismatches,
    representative_pages,
    visual_similarity,
)

from .conftest import sample

needs_renderer = pytest.mark.skipif(find_renderer() is None, reason="no LibreOffice renderer available")


# ----------------------------------------------------------------- measurements


def test_text_coverage_counts_missing_characters():
    assert _coverage("matter after", "matter after") == 1.0
    assert _coverage("matter after", "maer aer") < 0.75  # the damaged ligatures are missing letters
    assert _coverage("", "anything") == 1.0


def test_page_text_match_ignores_punctuation_glue():
    assert _page_text_match("Chapter 1 The First Harvest 4", "Chapter 1: The First Harvest.....4") == 1.0
    assert _page_text_match("alpha beta gamma delta", "alpha beta") == 0.5


def test_representative_pages_cover_front_middle_and_end():
    assert representative_pages(5) == [0, 1, 2, 3, 4]
    picks = representative_pages(300, limit=12)
    assert picks[:4] == [0, 1, 2, 3] and picks[-1] == 299 and len(picks) <= 12
    assert any(100 < p < 200 for p in picks)


def test_image_size_check_is_order_independent():
    assert _size_mismatches([(300, 150), (612, 792)], [(612, 792), (300.5, 150.2)]) == 0
    assert _size_mismatches([(300, 150)], [(300, 100)]) == 1  # stretched
    assert _size_mismatches([(612, 792)], [(468, 606)]) == 1  # shrunk into the margins


# ---------------------------------------------------------- programmatic report


@pytest.fixture(scope="module")
def book_run(book_pdf, tmp_path_factory):
    out = tmp_path_factory.mktemp("qa") / "book.docx"
    result = convert_pdf_to_docx(book_pdf, out)
    return book_pdf, out, result


def test_book_report_is_clean(book_run):
    pdf, docx, result = book_run
    report = analyse(pdf, docx, quality=result.quality)
    assert report.problems == []
    assert (report.source_pages, report.output_pages, report.explicit_page_breaks) == (8, 8, 7)
    assert report.text_coverage >= 0.98
    assert (report.suspicious_in_source, report.suspicious_in_output) == (0, 0)
    assert (report.images_in_source, report.images_in_output) == (3, 3)
    assert report.floating_images == 2 and report.image_size_mismatches == 0
    assert sum(report.headings.values()) >= 7
    assert report.header_text == "The Orchard Years" and report.footer_text
    assert {"TOC1", "Caption", "FootnoteText", "Index1"} <= set(report.styles_used)


def test_report_flags_unrepaired_glyphs(ligature_pdf, tmp_path, monkeypatch):
    """Without the repair step the output is full of damaged glyphs, and QA must say so."""
    monkeypatch.setattr(pipeline, "repair_pages", lambda pdf, pages: TextQuality())
    out = tmp_path / "broken.docx"
    convert_pdf_to_docx(ligature_pdf, out)
    report = analyse(ligature_pdf, out)
    assert not report.ok
    assert report.text_coverage < 0.97
    assert any("coverage" in p for p in report.problems)


def test_report_is_clean_once_glyphs_are_repaired(ligature_pdf, tmp_path):
    out = tmp_path / "fixed.docx"
    result = convert_pdf_to_docx(ligature_pdf, out)
    report = analyse(ligature_pdf, out, quality=result.quality)
    assert report.suspicious_in_source > 20  # the raw extraction really was damaged
    assert report.suspicious_in_output == 0 and report.text_coverage == 1.0
    assert set(report.glyphs_repaired.values()) == {"fi", "fl", "ff", "ffi", "ffl", "ft", "tt"}
    assert report.ok


def test_report_flags_wrong_output(book_run, tmp_path):
    """A DOCX that opens fine but is not this document must fail QA."""
    pdf, _, _ = book_run
    other = tmp_path / "other.docx"
    convert_pdf_to_docx(sample("01_"), other)
    report = analyse(pdf, other, quality={"layout_mode": "faithful"})
    assert not report.ok
    joined = " ".join(report.problems)
    assert "coverage" in joined and "image count" in joined and "page breaks" in joined


def test_flow_mode_is_not_judged_on_page_boundaries(book_run, tmp_path):
    pdf, _, _ = book_run
    out = tmp_path / "flow.docx"
    result = convert_pdf_to_docx(pdf, out, layout_mode="flow")
    report = analyse(pdf, out, quality=result.quality)
    assert report.layout_mode == "flow"
    assert not any("page breaks" in p for p in report.problems)
    assert report.text_coverage >= 0.98


@pytest.mark.parametrize("name", ["01_", "02_", "03_", "04_", "05_", "06_", "08_", "10_", "11_", "12_"])
def test_samples_pass_programmatic_qa(name, tmp_path):
    out = tmp_path / "s.docx"
    result = convert_pdf_to_docx(sample(name), out)
    report = analyse(sample(name), out, quality=result.quality)
    assert report.problems == [], name
    assert report.output_pages == report.source_pages


# ------------------------------------------------------------ visual regression


@pytest.fixture(scope="module")
def rendered_book(book_run, tmp_path_factory):
    pdf, docx, result = book_run
    work = tmp_path_factory.mktemp("render")
    rendered = docx_to_pdf(docx, work)
    return analyse(pdf, docx, rendered, result.quality, compare_dir=work / "compare"), rendered, work


@needs_renderer
@pytest.mark.visual
def test_rendered_book_has_the_same_pages(rendered_book):
    report, _, work = rendered_book
    assert report.rendered and report.output_pages == report.source_pages == 8
    assert all(page.text_match >= 0.95 for page in report.pages), [p.text_match for p in report.pages]
    assert report.problems == []
    assert len(list((work / "compare").glob("page_*.png"))) == 8  # side-by-side evidence is written


@needs_renderer
@pytest.mark.visual
def test_rendered_book_looks_like_the_source(rendered_book, book_pdf):
    report, rendered, _ = rendered_book
    similarity = {page.page: page.visual_similarity for page in report.pages}
    assert similarity[1] >= 0.9  # the full-bleed cover fills the page edge to edge
    assert similarity[5] >= 0.7  # figure, caption and the picture with wrapped text
    assert min(similarity.values()) >= 0.35
    assert sum(similarity.values()) / len(similarity) >= 0.65
    with pymupdf.open(book_pdf) as a, pymupdf.open(rendered) as b:
        # a page compared with a different page scores far lower: the measure discriminates
        assert visual_similarity(a[0], b[3]) < 0.3 < similarity[1]
        cover = b[0].get_pixmap(dpi=20)
        assert cover.pixel(1, 1)[:3] != (255, 255, 255)  # no white margin round the cover


@needs_renderer
@pytest.mark.visual
@pytest.mark.parametrize(("name", "floor"), [("01_", 0.7), ("02_", 0.6), ("05_", 0.8), ("10_", 0.7)])
def test_rendered_samples(name, floor, tmp_path):
    out = tmp_path / "s.docx"
    result = convert_pdf_to_docx(sample(name), out)
    rendered = docx_to_pdf(out, tmp_path / "render")
    report = analyse(sample(name), out, rendered, result.quality, visual_pages=6)
    assert report.output_pages == report.source_pages, report.problems
    assert all(page.text_match >= 0.95 for page in report.pages)
    visual = [page.visual_similarity for page in report.pages if page.visual_similarity is not None]
    assert min(visual) >= floor - 0.15 and sum(visual) / len(visual) >= floor
