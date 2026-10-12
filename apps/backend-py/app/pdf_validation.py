"""Upload-time PDF validation: magic bytes, parse check, encryption, text layer."""

from __future__ import annotations

from dataclasses import dataclass

import pymupdf

from . import errors
from .conversion.extract import count_words

SCANNED_MESSAGE = (
    "This PDF appears to be scanned or image-only: it has no text layer, so its text "
    "can't be extracted into an editable Word document."
)


@dataclass(slots=True)
class PdfInfo:
    page_count: int


def inspect_pdf(data: bytes) -> PdfInfo:
    """Validate an uploaded PDF; raises ApiError describing why it is rejected."""
    # The header may be preceded by a little junk, but must appear near the start.
    if b"%PDF-" not in data[:1024]:
        raise errors.invalid_pdf()
    try:
        doc = pymupdf.open(stream=data, filetype="pdf")
    except Exception as exc:  # noqa: BLE001 - any parse failure means "not a usable PDF"
        raise errors.invalid_pdf() from exc
    try:
        if doc.needs_pass:
            raise errors.encrypted_pdf()
        try:
            page_count = doc.page_count
            if page_count < 1:
                raise errors.invalid_pdf("The PDF has no pages.")
            doc.load_page(0)
            has_text = any(count_words(w[4] for w in page.get_text("words")) > 0 for page in doc)
        except errors.ApiError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise errors.invalid_pdf() from exc
        if not has_text:
            raise errors.invalid_pdf(SCANNED_MESSAGE)
        return PdfInfo(page_count=page_count)
    finally:
        doc.close()
