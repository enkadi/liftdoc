"""Layout fidelity: paragraph inference, page boundaries, structure roles, images, columns."""

from __future__ import annotations

import pymupdf
import pytest
from docx import Document
from docx.oxml.ns import qn

from app.conversion import convert_pdf_to_docx
from app.conversion.docx_writer import write_docx
from app.conversion.extract import RawCell, RawTable, extract_page
from app.conversion.model import ColumnMark, ImageRow, Paragraph, Rule, Table
from app.conversion.paragraphs import LeafContext, describe, reference_pitches, split_rows
from app.conversion.structure import Row, recover_structure, table_to_model
from app.conversion.text_repair import FontCatalog, repair_pages

from .conftest import sample
from .test_conversion import make_line

W = 612.0


def structure(pdf_path, mode="faithful"):
    with pymupdf.open(pdf_path) as pdf:
        catalog = FontCatalog(pdf)
        pages = [extract_page(pdf[i], i, catalog) for i in range(pdf.page_count)]
        repair_pages(pdf, pages)
        return recover_structure(pages, pdf, layout_mode=mode)


@pytest.fixture(scope="module")
def book(book_pdf):
    return structure(book_pdf)


def paras(model, kind=None):
    return [b for b in model.iter_blocks() if isinstance(b, Paragraph) and (kind is None or b.kind == kind)]


def pages_of(model) -> list[list]:
    """Blocks grouped by output page (split at explicit page breaks)."""
    out: list[list] = [[]]
    for block in model.iter_blocks():
        if getattr(block, "page_break_before", False) and out[-1]:
            out.append([])
        out[-1].append(block)
    return out


def rows(specs, size=11.0, pitch=14.0, block=0):
    """Rows from (x0, x1, text) specs stacked at a fixed pitch."""
    out = []
    for i, (x0, x1, text) in enumerate(specs):
        out.append(Row([make_line(text, x0, 100 + pitch * i, size=size, block=block, width=x1 - x0)]))
    return out


# ------------------------------------------------------- paragraphs from geometry

CTX = LeafContext(72.0, 540.0, 11.0, page_mid=306.0)
WORDS = "alpha beta gamma delta epsilon"


def split(specs, **kw):
    rs = rows(specs, **kw)
    return [[r.text for r in group] for group in split_rows(rs, CTX, reference_pitches(rs))]


def test_full_lines_join_and_a_short_line_ends_the_paragraph():
    groups = split([(72, 540, WORDS), (72, 540, WORDS), (72, 300, WORDS), (72, 540, WORDS), (72, 250, WORDS)])
    assert [len(g) for g in groups] == [3, 2]


def test_first_line_indent_starts_a_paragraph_without_any_gap():
    groups = split([(72, 540, WORDS), (72, 540, WORDS), (86, 540, WORDS), (72, 540, WORDS), (72, 540, WORDS)])
    assert [len(g) for g in groups] == [2, 3]


def test_extra_leading_starts_a_paragraph():
    rs = rows([(72, 540, WORDS), (72, 540, WORDS)]) + rows([(72, 540, WORDS), (72, 540, WORDS)])
    for r in rs[2:]:  # second pair 20pt lower than the regular 14pt pitch would put it
        r.segs[0].bbox = (r.x0, r.y0 + 34, r.x1, r.y1 + 34)
        for span in r.segs[0].spans:
            span.origin_y += 34
    assert [len(g) for g in split_rows(rs, CTX, reference_pitches(rs))] == [2, 2]


def test_ragged_entry_rows_stay_separate():
    """A contents page is one PDF block of unrelated lines; none of them is a wrapped line."""
    specs = [
        (100, x1, f"Chapter {n}: A Title") for n, x1 in enumerate((283, 256, 259, 278, 251, 298, 319, 257), 1)
    ]
    assert [len(g) for g in split(specs, pitch=22)] == [1] * 8


def test_narrow_quotation_is_one_paragraph():
    groups = split([(110, 500, WORDS), (110, 501, WORDS), (110, 428, WORDS)], pitch=25)
    assert [len(g) for g in groups] == [3]


@pytest.mark.parametrize(
    ("specs", "align"),
    [
        ([(72, 540, WORDS), (72, 540, WORDS), (72, 300, WORDS)], "justify"),
        ([(72, 520, WORDS), (72, 498, WORDS), (72, 300, WORDS)], "left"),
        ([(100, 512, WORDS), (206, 406, WORDS), (150, 462, WORDS)], "center"),
        ([(300, 540, WORDS), (250, 540, WORDS), (380, 540, WORDS)], "right"),
        ([(206, 406, WORDS)], "center"),
        ([(72, 300, WORDS)], "left"),
    ],
)
def test_alignment_is_read_from_line_edges(specs, align):
    assert describe(rows(specs), CTX).align == align


def test_indents_and_leading_are_measured():
    geo = describe(rows([(86, 540, WORDS), (72, 540, WORDS), (72, 300, WORDS)], pitch=18), CTX)
    assert (geo.left_x, geo.first_x, geo.pitch) == (72, 86, 18)


# ------------------------------------------------------------ book fixture: model


def test_every_source_page_keeps_its_page(book):
    assert book.layout_mode == "faithful" and book.page_count == 8
    pages = pages_of(book)
    assert len(pages) == 8
    first_words = [
        next((b.text[:9] for b in page if isinstance(b, Paragraph) and b.text), "") for page in pages
    ]
    assert first_words == [
        "THE ORCHA", "The Orcha", "Contents", "Chapter 1", "The orcha", "Chapter 2", "Index", "About the",
    ]  # fmt: skip


def test_flow_mode_reflows_instead(book_pdf):
    flow = structure(book_pdf, "flow")
    assert flow.layout_mode == "flow"
    assert len(pages_of(flow)) < 8
    assert not any(isinstance(b, ColumnMark) for b in flow.iter_blocks())


def test_cover_is_a_full_bleed_picture_behind_its_title(book):
    cover = pages_of(book)[0]
    host = next(b for b in cover if isinstance(b, Paragraph) and b.anchors)
    picture = host.anchors[0]
    assert (picture.wrap, picture.x, picture.y) == ("behind", 0, 0)
    assert (round(picture.width), round(picture.height)) == (612, 792)  # no margins added
    assert [p.text for p in cover if isinstance(p, Paragraph)] == [
        "THE ORCHARD YEARS", "A Season-by-Season Memoir", "Ama Boateng",
    ]  # fmt: skip


def test_front_matter_lines_are_separate_centred_paragraphs(book):
    front = [b for b in pages_of(book)[1] if isinstance(b, Paragraph)]
    assert [p.text for p in front] == [
        "The Orchard Years is a work of nonfiction.",
        "Copyright 2024 by Ama Boateng",
        "All rights reserved.",
        "Published by Hillside Press, Kumasi.",
        "First edition.",
        "ISBN 978-0-00-000000-0",
    ]
    assert {p.align for p in front} == {"center"}
    # groups of lines are separated by more space than lines within a group
    assert front[1].space_before > front[2].space_before + 4


def test_contents_rows_are_separate_entries_with_levels_and_page_numbers(book):
    toc = paras(book, "toc")
    assert [(p.text, p.level) for p in toc] == [
        ("Chapter 1: The First Harvest\t4", 1),
        ("Chapter 2: Winter Pruning\t6", 1),
        ("Notes on the ledgers\t6", 2),
        ("Index\t7", 1),
        ("About the Author\t8", 1),
    ]
    assert "Contents" in [p.text for p in paras(book, "heading")]


def test_chapter_headings_and_hierarchy(book):
    levels = {p.text: p.level for p in paras(book, "heading")}
    for title in ("The First Harvest", "Winter Pruning", "Index", "About the Author", "Contents"):
        assert title in levels
    assert levels["Chapter 1"] > levels["The First Harvest"]  # the label is subordinate to the title
    assert levels["Notes on the ledgers"] > levels["Winter Pruning"]
    assert not any("Chapter 1:" in p.text for p in paras(book, "heading"))  # contents rows are not headings


def test_prose_keeps_justification_indent_and_leading(book):
    chapter = [b for b in pages_of(book)[3] if isinstance(b, Paragraph) and b.kind == "body"]
    assert len(chapter) == 5  # five paragraphs separated only by their first-line indent
    assert {p.align for p in chapter} == {"justify"}
    assert [p.first_indent for p in chapter] == [0, 14, 14, 14, 14]
    assert {p.line_pitch for p in chapter} == {14}
    assert " 1 " in chapter[4].text  # the raised footnote reference stays inside its paragraph


def test_footnote_under_its_separator_rule(book):
    page = pages_of(book)[3]
    notes = [b for b in page if isinstance(b, Paragraph) and b.kind == "footnote"]
    assert len(notes) == 1 and notes[0].text.startswith("1 The pencil ledgers survive")
    rule_at = next(i for i, b in enumerate(page) if isinstance(b, Rule))
    assert page[rule_at + 1] is notes[0]
    assert 100 < page[rule_at].width < 140  # a short rule, not a full-width one


def test_figure_keeps_its_caption_and_size(book):
    page = pages_of(book)[4]
    at = next(i for i, b in enumerate(page) if isinstance(b, ImageRow))
    figure, caption = page[at], page[at + 1]
    assert caption.kind == "caption" and caption.text.startswith("Figure 1: Yield by season")
    assert figure.keep_with_next and figure.align == "center" and caption.align == "center"
    assert (round(figure.images[0].width), round(figure.images[0].height)) == (300, 150)


def test_picture_with_text_beside_it_floats(book):
    page = pages_of(book)[4]
    floats = [pic for b in page if isinstance(b, Paragraph) for pic in b.anchors]
    assert len(floats) == 1
    pic = floats[0]
    assert pic.wrap == "square" and (round(pic.x), round(pic.width), round(pic.height)) == (390, 150, 150)
    # the lines cut short by the picture still form whole paragraphs
    body = [b for b in page if isinstance(b, Paragraph) and b.kind == "body"]
    assert len(body) == 4 and all(p.text.endswith("agree with the trees.") for p in body)


def test_block_quotation_and_list(book):
    page = pages_of(book)[5]
    quote = next(b for b in page if isinstance(b, Paragraph) and b.indent_left >= 30)
    assert quote.indent_left == 36 and quote.align == "justify" and quote.size == 10
    items = [b.text for b in page if isinstance(b, Paragraph) and b.kind == "list"]
    assert items == ["Count the crates before noon", "Weigh every tenth crate", "Sign the page at dusk"]


def test_index_entries_and_columns(book):
    page = pages_of(book)[6]
    entries = [b.text for b in page if isinstance(b, Paragraph) and b.kind == "index"]
    assert len(entries) == 20 and entries[0] == "apples, 4, 5" and entries[-1] == "yield, 5"
    assert entries == sorted(entries)  # left column read fully before the right one
    marks = [b.kind for b in page if isinstance(b, ColumnMark)]
    assert marks[:2] == ["start", "break"]
    heading = next(b for b in page if isinstance(b, Paragraph) and b.kind == "heading")
    assert heading.text == "Index" and heading.align == "center"


def test_end_matter_and_running_furniture(book):
    last = [b for b in pages_of(book)[7] if isinstance(b, Paragraph)]
    assert [p.text for p in last[-2:]] == ["Set in Times and printed in Kumasi.", "Hillside Press"]
    assert "".join(r.text for r in book.header) == "The Orchard Years"
    assert book.footer_page_field is not None
    body_text = [p.text for p in paras(book)]
    assert "The Orchard Years" not in body_text[3:]  # the running head is not repeated in the body
    assert book.images_detected == book.images_in_source == 3


# ------------------------------------------------------------- book fixture: DOCX


@pytest.fixture(scope="module")
def book_docx(book_pdf, tmp_path_factory):
    out = tmp_path_factory.mktemp("docx") / "book.docx"
    result = convert_pdf_to_docx(book_pdf, out)
    return Document(str(out)), result


def test_docx_uses_named_styles_not_just_normal(book_docx):
    doc, _ = book_docx
    used = {p.style.name for p in doc.paragraphs}
    assert {
        "Title",
        "Body Text",
        "TOC 1",
        "TOC 2",
        "Caption",
        "Footnote Text",
        "Index 1",
        "List Paragraph",
    } <= used
    assert any(name.startswith("Heading") for name in used)
    body = [p for p in doc.paragraphs if p.style.name == "Body Text"]
    assert len(body) >= 8  # the repeated prose format is one reusable style
    style = doc.styles["Body Text"]
    assert style.paragraph_format.alignment == 3  # justified
    assert style.font.size.pt == 11 and style.paragraph_format.line_spacing.pt == 14
    direct = [p for p in body if p.alignment is not None or p.paragraph_format.line_spacing is not None]
    assert len(direct) <= len(body) // 3  # formatting comes from the style, not from overrides


def test_docx_page_breaks_images_and_columns(book_docx):
    doc, result = book_docx
    body = doc.element.body
    assert result.metrics["output_page_count"] == 8
    anchors = list(body.iter(qn("wp:anchor")))
    assert len(anchors) == 2 and len(list(body.iter(qn("wp:inline")))) == 1
    cover = anchors[0]
    extent = cover.find(qn("wp:extent"))
    assert cover.get("behindDoc") == "1"
    assert (int(extent.get("cx")), int(extent.get("cy"))) == (612 * 12700, 792 * 12700)
    assert [cover.find(qn(f"wp:position{axis}")).get("relativeFrom") for axis in "HV"] == ["page", "page"]
    assert anchors[1].find(qn("wp:wrapSquare")) is not None
    columns = [c.get(qn("w:num")) for c in body.iter(qn("w:cols")) if c.get(qn("w:num"))]
    assert columns == ["2"]
    toc = next(p for p in doc.paragraphs if p.style.name == "TOC 1")
    assert "\t" in toc.text and doc.styles["TOC 1"].paragraph_format.tab_stops[0].leader is not None
    assert result.quality["images_in_output"] == result.quality["images_in_source"] == 3


# ------------------------------------------------- regressions from real documents


def make_pdf(path, draw):
    doc = pymupdf.open()
    draw(doc)
    doc.save(path)
    doc.close()
    return path


def test_margin_notes_beside_prose_are_not_a_table(tmp_path):
    """A book with side notes produced 500 two-column "tables" of note line + body line."""

    def draw(doc):
        page = doc.new_page()
        for i in range(8):
            y = 120 + 14 * i
            page.insert_text((60, y), f"note {i} in margin", fontsize=7, fontname="helv")
            page.insert_text(
                (170, y),
                "body text that runs on as ordinary prose across the measure it",
                fontsize=11,
                fontname="tiro",
            )

    model = structure(make_pdf(tmp_path / "notes.pdf", draw))
    assert model.tables_detected == 0
    text = " ".join(p.text for p in paras(model))
    assert "note 0 in margin" in text and "body text that runs on" in text


def test_highlighted_text_is_not_a_table(tmp_path):
    """Highlight rectangles behind running text looked like filled table cells."""

    def draw(doc):
        page = doc.new_page()
        for i in range(6):
            y = 120 + 16 * i
            if i in (2, 3):
                page.draw_rect(
                    pymupdf.Rect(140 if i == 2 else 72, y - 11, 540 if i == 2 else 300, y + 4),
                    color=None,
                    fill=(1, 0.9, 0),
                )
            page.insert_text(
                (72, y),
                "an ordinary line of prose that carries on to the right hand margin of it",
                fontsize=11,
                fontname="tiro",
            )

    model = structure(make_pdf(tmp_path / "highlight.pdf", draw))
    assert model.tables_detected == 0 and len(paras(model, "body")) == 1


def test_overlapping_table_cells_do_not_fail_the_conversion(tmp_path):
    """PyMuPDF can report cells that overlap; python-docx then raised InvalidSpanError."""
    cells = [
        RawCell(0, 0, 2, 2, (0, 0, 20, 20)),
        RawCell(1, 1, 2, 2, (10, 10, 30, 30)),  # overlaps the first cell
        RawCell(0, 2, 1, 1, (20, 0, 30, 10)),
    ]
    table = table_to_model(RawTable((0, 0, 30, 30), 3, 3, [0, 10, 20, 30], cells, True, 0, [0, 10, 20, 30]))
    spans = [(c.row_span, c.col_span) for row in table.rows for c in row if c is not None]
    assert (2, 2) in spans and all(len(row) == 3 for row in table.rows)
    model = structure(sample("01_"))
    model.sections[0].blocks.insert(1, table)
    write_docx(model, tmp_path / "overlap.docx")
    assert len(Document(str(tmp_path / "overlap.docx")).tables) == 1


def test_same_size_running_head_is_detected_by_repetition(tmp_path):
    def draw(doc):
        for n in range(5):
            page = doc.new_page()
            page.insert_text((72, 50), "A BOOK TITLE IN THE RUNNING HEAD", fontsize=11, fontname="tiro")
            page.insert_text((300, 805), str(n + 1), fontsize=11, fontname="tiro")
            for i in range(6):
                page.insert_text(
                    (72, 140 + 14 * i),
                    f"page {n} body line {i} continues for a while here",
                    fontsize=11,
                    fontname="tiro",
                )

    model = structure(make_pdf(tmp_path / "heads.pdf", draw))
    assert "".join(r.text for r in model.header) == "A BOOK TITLE IN THE RUNNING HEAD"
    assert model.footer_page_field is not None
    assert not any("RUNNING HEAD" in p.text for p in paras(model))


# ------------------------------------------------------- samples in faithful mode


def test_samples_keep_page_boundaries_in_faithful_mode(tmp_path):
    for name, pages in (("01_", 2), ("04_", 3), ("10_", 40), ("11_", 3)):
        result = convert_pdf_to_docx(sample(name), tmp_path / "o.docx")
        assert result.metrics["output_page_count"] == pages, name
    # the table continued over three pages stays three parts, but is still one table
    doc = Document(str(tmp_path / "o.docx"))
    result = convert_pdf_to_docx(sample("04_"), tmp_path / "t.docx")
    doc = Document(str(tmp_path / "t.docx"))
    assert len(doc.tables) == 6 and result.metrics["tables_detected"] == 4
    assert all(
        isinstance(b, Table | Paragraph | ImageRow | Rule | ColumnMark)
        for b in structure(sample("04_")).iter_blocks()
    )


def test_two_column_sample_becomes_real_columns(tmp_path):
    convert_pdf_to_docx(sample("02_"), tmp_path / "c.docx")
    body = Document(str(tmp_path / "c.docx")).element.body
    assert [c.get(qn("w:num")) for c in body.iter(qn("w:cols")) if c.get(qn("w:num"))] == ["2", "2"]
    assert len(body.findall(f".//{qn('w:br')}[@{qn('w:type')}='column']")) == 2
