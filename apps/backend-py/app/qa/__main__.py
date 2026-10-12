"""Usage: python -m app.qa <file.pdf> [--out DIR] [--mode faithful|flow] [--no-render]"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .render import find_renderer
from .report import run_qa


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.qa", description="Convert a PDF and report fidelity."
    )
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--out", type=Path, default=Path("qa-out"))
    parser.add_argument("--mode", choices=("faithful", "flow"), default="faithful")
    parser.add_argument(
        "--no-render", action="store_true", help="skip rendering the DOCX (no visual comparison)"
    )
    parser.add_argument("--visual-pages", type=int, default=12)
    args = parser.parse_args()

    report = run_qa(args.pdf, args.out / args.pdf.stem, args.mode, not args.no_render, args.visual_pages)
    print(
        f"{report.source}: {report.source_pages} pages -> {report.output_pages} ({'rendered' if report.rendered else 'estimated'})"
    )
    print(f"  renderer            {find_renderer() or 'none'}")
    print(f"  text coverage       {report.text_coverage:.1%}")
    print(
        f"  suspicious glyphs   source {report.suspicious_in_source} -> output {report.suspicious_in_output}  repaired {report.glyphs_repaired}"
    )
    print(
        f"  images              {report.images_in_output}/{report.images_in_source} ({report.floating_images} floating, {report.image_size_mismatches} resized)"
    )
    print(f"  page breaks         {report.explicit_page_breaks}")
    print(f"  headings            {report.headings}")
    print(f"  header / footer     {report.header_text!r} / {report.footer_text!r}")
    if report.pages:
        matches = [c.text_match for c in report.pages]
        visual = [c.visual_similarity for c in report.pages if c.visual_similarity is not None]
        print(f"  page text match     min {min(matches):.2f}  mean {sum(matches) / len(matches):.2f}")
        if visual:
            print(
                f"  visual similarity   min {min(visual):.2f}  mean {sum(visual) / len(visual):.2f}  ({len(visual)} pages)"
            )
    print("  RESULT              " + ("OK" if report.ok else "PROBLEMS"))
    for problem in report.problems:
        print(f"    - {problem}")
    print(f"  artefacts in {args.out / args.pdf.stem}")
    return 0 if report.ok else 1


if __name__ == "__main__":
    sys.exit(main())
