"""PDF -> DOCX conversion pipeline with phase/progress reporting."""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import pymupdf

from .docx_writer import write_docx
from .extract import extract_page
from .inspect_docx import inspect_docx
from .structure import recover_structure
from .text_repair import FontCatalog, repair_pages

log = logging.getLogger(__name__)

# Phases in lifecycle order with the progress range each one covers.
PHASES: list[tuple[str, int, int]] = [
    ("QUEUED", 0, 0),
    ("LOADING_SOURCE", 2, 8),
    ("EXTRACTING_CONTENT", 8, 50),
    ("RECOVERING_STRUCTURE", 50, 70),
    ("GENERATING_DOCUMENT", 70, 90),
    ("SAVING_OUTPUT", 90, 99),
    ("COMPLETED", 100, 100),
]
PHASE_RANGE = {name: (lo, hi) for name, lo, hi in PHASES}

ProgressFn = Callable[[str, int], None]


@dataclass(slots=True)
class ConversionResult:
    page_count: int
    output_size: int
    metrics: dict[str, int | None]
    seconds: float
    # Text-fidelity facts for logs and QA (not part of the HTTP contract).
    quality: dict | None = None


class ConversionError(Exception):
    """The PDF could not be converted."""


def _noop(phase: str, percent: int) -> None:
    return None


def convert_pdf_to_docx(
    pdf_path: Path,
    docx_path: Path,
    progress: ProgressFn | None = None,
    title: str = "",
    layout_mode: str = "faithful",
) -> ConversionResult:
    report = progress or _noop
    started = time.perf_counter()

    def within(phase: str, done: int, total: int) -> None:
        lo, hi = PHASE_RANGE[phase]
        report(phase, lo + int((hi - lo) * done / max(total, 1)))

    report("LOADING_SOURCE", PHASE_RANGE["LOADING_SOURCE"][0])
    try:
        pdf = pymupdf.open(str(pdf_path))
    except Exception as exc:
        raise ConversionError(f"cannot open PDF: {exc}") from exc
    try:
        if pdf.needs_pass:
            raise ConversionError("PDF is password protected")
        page_count = pdf.page_count
        report("LOADING_SOURCE", PHASE_RANGE["LOADING_SOURCE"][1])

        report("EXTRACTING_CONTENT", PHASE_RANGE["EXTRACTING_CONTENT"][0])
        pages = []
        catalog = FontCatalog(pdf)
        for index in range(page_count):
            pages.append(extract_page(pdf[index], index, catalog))
            within("EXTRACTING_CONTENT", index + 1, page_count)
        source_words = sum(p.word_count for p in pages)
        # Fix glyphs the fonts' ToUnicode maps could not name before any text is interpreted.
        text_quality = repair_pages(pdf, pages)

        report("RECOVERING_STRUCTURE", PHASE_RANGE["RECOVERING_STRUCTURE"][0])
        model = recover_structure(
            pages, pdf, lambda done, total: within("RECOVERING_STRUCTURE", done, total), layout_mode
        )
        model.text_quality = text_quality
    finally:
        pdf.close()

    report("GENERATING_DOCUMENT", PHASE_RANGE["GENERATING_DOCUMENT"][0])
    docx_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = docx_path.with_suffix(".docx.part")
    write_docx(model, tmp_path, title=title)
    report("GENERATING_DOCUMENT", PHASE_RANGE["GENERATING_DOCUMENT"][1])

    report("SAVING_OUTPUT", PHASE_RANGE["SAVING_OUTPUT"][0])
    stats = inspect_docx(tmp_path)
    tmp_path.replace(docx_path)  # atomic: a download never sees a half-written file
    size = docx_path.stat().st_size
    report("SAVING_OUTPUT", PHASE_RANGE["SAVING_OUTPUT"][1])

    metrics = {
        "source_word_count": source_words,
        "output_word_count": stats.word_count,
        "ordered_lists_detected": model.ordered_lists,
        "unordered_lists_detected": model.unordered_lists,
        "ordered_lists_reconstructed": stats.ordered_lists,
        "unordered_lists_reconstructed": stats.unordered_lists,
        "headings_detected": sum(model.heading_counts.values()),
        "h1_heading_count": model.heading_counts.get(1, 0),
        "h2_heading_count": model.heading_counts.get(2, 0),
        "h3_heading_count": model.heading_counts.get(3, 0),
        "tables_detected": model.tables_detected,
        "images_detected": model.images_detected,
        "multi_column_page_count": model.multi_column_pages,
        # Layout-faithful output keeps one page per source page through explicit breaks; the
        # simulated estimate is only meaningful for reflowed output.
        "output_page_count": stats.explicit_pages if model.layout_mode == "faithful" else stats.page_count,
    }
    quality = {
        "layout_mode": model.layout_mode,
        "ligatures_expanded": text_quality.ligatures_expanded,
        "glyphs_repaired": dict(text_quality.repaired),
        "repaired_chars": text_quality.repaired_chars,
        "unresolved_glyphs": dict(text_quality.unresolved),
        "suspicious_chars": text_quality.suspicious_chars,
        "suspicious_samples": list(text_quality.samples),
        "images_in_source": model.images_in_source,
        "images_in_output": stats.images,
    }
    return ConversionResult(page_count, size, metrics, time.perf_counter() - started, quality)
